import { DatabaseSync } from "node:sqlite";
import { calculateRoundRows, holeFieldNames, type TeamCode } from "../lib/quota";

type CliOptions = {
  matchName?: string;
  roundId?: string;
  newName: string;
  newDate: string;
  dbPath: string;
};

type PlayerRow = {
  id: string;
  name: string;
  startingQuota: number;
  currentQuota: number;
};

type RoundRow = {
  id: string;
  roundName: string;
  roundDate: number;
  completedAt: number | null;
  createdAt: number;
};

type EntryRow = {
  id: string;
  roundId: string;
  playerId: string;
  playerName: string;
  team: string | null;
  startQuota: number;
  holeScores: Array<number | null>;
};

function parseArgs(argv: string[]): CliOptions {
  const options: Partial<CliOptions> = {
    dbPath: "C:/Projectsgolf-app/prisma/dev.db"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--match-name") {
      options.matchName = next;
      index += 1;
      continue;
    }

    if (arg === "--round-id") {
      options.roundId = next;
      index += 1;
      continue;
    }

    if (arg === "--new-name") {
      options.newName = next;
      index += 1;
      continue;
    }

    if (arg === "--new-date") {
      options.newDate = next;
      index += 1;
      continue;
    }

    if (arg === "--db-path") {
      options.dbPath = next;
      index += 1;
      continue;
    }
  }

  if (!options.newName || !options.newDate) {
    throw new Error("Usage: npm run db:repair-archived-round-date -- --match-name 1.15 --new-name 4.24 --new-date 2026-04-24");
  }

  return options as CliOptions;
}

function parseDateToEpoch(value: string) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid date: ${value}`);
  }

  return parsed;
}

function getCompletedRounds(db: DatabaseSync): RoundRow[] {
  return db
    .prepare(
      "select id, roundName, roundDate, completedAt, createdAt from Round where completedAt is not null order by roundDate asc, completedAt asc, createdAt asc"
    )
    .all() as RoundRow[];
}

function getPlayers(db: DatabaseSync): PlayerRow[] {
  return db
    .prepare("select id, name, startingQuota, currentQuota from Player order by name asc")
    .all() as PlayerRow[];
}

function getEntriesForRound(db: DatabaseSync, roundId: string): EntryRow[] {
  const rows = db
    .prepare(
      `select
        e.id,
        e.roundId,
        e.playerId,
        p.name as playerName,
        e.team,
        e.startQuota,
        ${holeFieldNames.map((fieldName) => `e.${fieldName}`).join(", ")}
      from RoundEntry e
      join Player p on p.id = e.playerId
      where e.roundId = ?
      order by p.name asc`
    )
    .all(roundId) as Array<Record<string, string | number | null>>;

  return rows.map((row) => ({
    id: String(row.id),
    roundId: String(row.roundId),
    playerId: String(row.playerId),
    playerName: String(row.playerName),
    team: row.team == null ? null : String(row.team),
    startQuota: Number(row.startQuota),
    holeScores: holeFieldNames.map((fieldName) => {
      const value = row[fieldName];
      return value == null ? null : Number(value);
    })
  }));
}

function repairRoundMetadata(db: DatabaseSync, options: CliOptions) {
  const targetRound = options.roundId
    ? (db
        .prepare("select id, roundName, roundDate, completedAt, createdAt from Round where id = ?")
        .get(options.roundId) as RoundRow | undefined)
    : (db
        .prepare(
          "select id, roundName, roundDate, completedAt, createdAt from Round where completedAt is not null and roundName = ? order by roundDate asc, completedAt asc, createdAt asc limit 1"
        )
        .get(options.matchName ?? "") as RoundRow | undefined);

  if (!targetRound) {
    return null;
  }

  const nextRoundDate = parseDateToEpoch(options.newDate);
  db.prepare("update Round set roundName = ?, roundDate = ? where id = ?").run(
    options.newName,
    nextRoundDate,
    targetRound.id
  );

  return {
    id: targetRound.id,
    previousName: targetRound.roundName,
    previousRoundDate: targetRound.roundDate,
    nextName: options.newName,
    nextRoundDate
  };
}

function rebuildQuotaHistory(db: DatabaseSync) {
  const players = getPlayers(db);
  const rounds = getCompletedRounds(db);
  const quotaMap = new Map(players.map((player) => [player.id, player.startingQuota]));

  const updateEntry = db.prepare(
    `update RoundEntry set
      startQuota = ?,
      frontQuota = ?,
      backQuota = ?,
      frontNine = ?,
      backNine = ?,
      frontPlusMinus = ?,
      backPlusMinus = ?,
      totalPoints = ?,
      plusMinus = ?,
      nextQuota = ?,
      rank = ?
    where id = ?`
  );
  const updatePlayer = db.prepare("update Player set currentQuota = ?, updatedAt = CURRENT_TIMESTAMP where id = ?");

  for (const round of rounds) {
    const entries = getEntriesForRound(db, round.id);
    const recalculated = calculateRoundRows(
      entries.map((entry) => ({
        playerId: entry.playerId,
        playerName: entry.playerName,
        team: (entry.team as TeamCode | null) ?? null,
        holeScores: entry.holeScores,
        startQuota: quotaMap.get(entry.playerId) ?? entry.startQuota
      }))
    );

    for (const row of recalculated) {
      const matchingEntry = entries.find((entry) => entry.playerId === row.playerId);
      if (!matchingEntry) {
        continue;
      }

      updateEntry.run(
        row.startQuota,
        row.frontQuota,
        row.backQuota,
        row.frontNine,
        row.backNine,
        row.frontPlusMinus,
        row.backPlusMinus,
        row.totalPoints,
        row.plusMinus,
        row.nextQuota,
        row.rank,
        matchingEntry.id
      );

      quotaMap.set(row.playerId, row.nextQuota);
    }
  }

  for (const player of players) {
    updatePlayer.run(quotaMap.get(player.id) ?? player.currentQuota, player.id);
  }

  return {
    roundCount: rounds.length,
    playerCount: players.length,
    quotas: Object.fromEntries(players.map((player) => [player.name, quotaMap.get(player.id) ?? player.currentQuota]))
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const db = new DatabaseSync(options.dbPath);

  db.exec("begin immediate transaction");

  try {
    const repairedRound = repairRoundMetadata(db, options);
    const rebuild = rebuildQuotaHistory(db);
    db.exec("commit");

    console.log(
      JSON.stringify(
        {
          repairedRound,
          rebuild,
          note: repairedRound
            ? "Archived round updated and quota history rebuilt."
            : "No matching archived round was found in this SQLite database. Quota history was rebuilt without renaming a round."
        },
        null,
        2
      )
    );
  } catch (error) {
    db.exec("rollback");
    throw error;
  } finally {
    db.close();
  }
}

main();
