import { DatabaseSync } from "node:sqlite";
import { calculateRoundRows, holeFieldNames, type TeamCode } from "../lib/quota";

type PlayerRow = {
  id: string;
  name: string;
  startingQuota: number;
  currentQuota: number;
};

type RoundRow = {
  id: string;
  roundName: string | null;
  completedAt: number | null;
  roundDate: number | null;
  createdAt: number;
  roundMode: string;
  isTestRound: boolean;
};

type EntryRow = {
  id: string;
  playerId: string;
  playerName: string;
  team: string | null;
  startQuota: number;
  holeScores: Array<number | null>;
};

function shouldSkipQuotaProgression(round: { roundMode: string; isTestRound?: boolean | null }) {
  return round.roundMode === "SKINS_ONLY" || Boolean(round.isTestRound);
}

function getColumnSet(db: DatabaseSync, tableName: string) {
  const rows = db.prepare(`pragma table_info('${tableName}')`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function getPlayers(db: DatabaseSync) {
  return db
    .prepare("select id, name, startingQuota, currentQuota from Player order by name asc")
    .all() as PlayerRow[];
}

function getCompletedRounds(db: DatabaseSync) {
  const roundColumns = getColumnSet(db, "Round");
  const selectRoundMode = roundColumns.has("roundMode") ? "roundMode" : "'MATCH_QUOTA' as roundMode";
  const selectIsTestRound = roundColumns.has("isTestRound") ? "isTestRound" : "0 as isTestRound";

  return db
    .prepare(
      `select id, roundName, completedAt, roundDate, createdAt, ${selectRoundMode}, ${selectIsTestRound}
       from Round
       where completedAt is not null
       order by completedAt asc, roundDate asc, createdAt asc`
    )
    .all() as Array<{
      id: string;
      roundName: string | null;
      completedAt: number | null;
      roundDate: number | null;
      createdAt: number;
      roundMode: string;
      isTestRound: number;
    }>;
}

function getEntriesForRound(db: DatabaseSync, roundId: string) {
  const rows = db
    .prepare(
      `select
        e.id,
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
    playerId: String(row.playerId),
    playerName: String(row.playerName),
    team: row.team == null ? null : String(row.team),
    startQuota: Number(row.startQuota),
    holeScores: holeFieldNames.map((fieldName) => {
      const value = row[fieldName];
      return value == null ? null : Number(value);
    })
  })) as EntryRow[];
}

function main() {
  const dbPath = process.argv[2] ?? "C:/Projectsgolf-app/prisma/dev.db";
  const db = new DatabaseSync(dbPath);
  const playerColumns = getColumnSet(db, "Player");

  db.exec("begin immediate transaction");

  try {
    const players = getPlayers(db);
    const rounds = getCompletedRounds(db).map((round) => ({
      ...round,
      isTestRound: Boolean(round.isTestRound)
    })) as RoundRow[];
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

    const updatePlayer = playerColumns.has("quota")
      ? db.prepare(
          "update Player set quota = ?, currentQuota = ?, updatedAt = CURRENT_TIMESTAMP where id = ?"
        )
      : db.prepare(
          "update Player set currentQuota = ?, updatedAt = CURRENT_TIMESTAMP where id = ?"
        );

    for (const round of rounds) {
      const entries = getEntriesForRound(db, round.id);
      if (!entries.length) {
        continue;
      }

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

        if (!shouldSkipQuotaProgression(round)) {
          quotaMap.set(row.playerId, row.nextQuota);
        }
      }
    }

    for (const player of players) {
      const nextQuota = quotaMap.get(player.id) ?? player.startingQuota;
      if (playerColumns.has("quota")) {
        updatePlayer.run(nextQuota, nextQuota, player.id);
      } else {
        updatePlayer.run(nextQuota, player.id);
      }
    }

    db.exec("commit");

    console.log(
      JSON.stringify(
        {
          dbPath,
          roundsProcessed: rounds.length,
          playersProcessed: players.length
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
