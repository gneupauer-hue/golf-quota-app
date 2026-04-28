import { DatabaseSync } from "node:sqlite";
import { BASELINE_SEASON_START_2026, requireBaselineQuota2026 } from "../lib/baseline-quotas-2026";
import { rebuildPlayerQuotaHistory } from "../lib/quota-history";

type DbPlayer = {
  id: string;
  name: string;
  startingQuota: number;
  currentQuota: number;
};

type DbRound = {
  roundId: string;
  roundName: string;
  roundDate: number | null;
  completedAt: number | null;
  createdAt: number | null;
  totalPoints: number;
  startQuota: number;
  nextQuota: number;
  plusMinus: number;
};

function toIso(value: number | null) {
  return value == null ? null : new Date(value).toISOString();
}

function main() {
  const dbPath = process.argv[2] ?? "C:/Projectsgolf-app/prisma/dev.db";
  const db = new DatabaseSync(dbPath);

  try {
    const players = db
      .prepare("select id, name, startingQuota, currentQuota from Player order by name asc")
      .all() as DbPlayer[];

    const allRows = db
      .prepare(`
        select
          p.id as playerId,
          p.name as playerName,
          r.id as roundId,
          r.roundName,
          r.roundDate,
          r.completedAt,
          r.createdAt,
          e.totalPoints,
          e.startQuota,
          e.nextQuota,
          e.plusMinus
        from RoundEntry e
        join Player p on p.id = e.playerId
        join Round r on r.id = e.roundId
        where r.completedAt is not null and r.completedAt >= ?
        order by p.name asc, r.completedAt asc, r.roundDate asc, r.createdAt asc
      `)
      .all(BASELINE_SEASON_START_2026.getTime()) as Array<{
        playerId: string;
        playerName: string;
        roundId: string;
        roundName: string;
        roundDate: number | null;
        completedAt: number | null;
        createdAt: number | null;
        totalPoints: number;
        startQuota: number;
        nextQuota: number;
        plusMinus: number;
      }>;

    const rowsByPlayer = new Map<string, DbRound[]>();
    for (const row of allRows) {
      const current = rowsByPlayer.get(row.playerId) ?? [];
      current.push({
        roundId: row.roundId,
        roundName: row.roundName,
        roundDate: row.roundDate,
        completedAt: row.completedAt,
        createdAt: row.createdAt,
        totalPoints: row.totalPoints,
        startQuota: row.startQuota,
        nextQuota: row.nextQuota,
        plusMinus: row.plusMinus
      });
      rowsByPlayer.set(row.playerId, current);
    }

    const summary = players.map((player) => {
      const rounds = rowsByPlayer.get(player.id) ?? [];
      const rebuilt = rebuildPlayerQuotaHistory({
        baselineQuota: requireBaselineQuota2026(player.name),
        currentQuota: player.currentQuota,
        rounds: rounds.map((round) => ({
          roundId: round.roundId,
          roundName: round.roundName,
          roundDate: round.roundDate ? new Date(round.roundDate) : new Date(0),
          completedAt: round.completedAt ? new Date(round.completedAt) : null,
          createdAt: round.createdAt ? new Date(round.createdAt) : null,
          totalPoints: round.totalPoints,
          startQuota: round.startQuota,
          plusMinus: round.plusMinus,
          nextQuota: round.nextQuota
        }))
      });

      const roundChecks = rebuilt.roundsAscending.map((round, index, array) => {
        const prior = array[index - 1] ?? null;
        const chainOk = prior ? round.startQuota === prior.nextQuota : true;
        return {
          roundDate: toIso(round.completedAt ? new Date(round.completedAt).getTime() : null),
          roundName: round.roundName,
          rebuiltStartQuota: round.startQuota,
          movement: round.quotaMovement,
          rebuiltNextQuota: round.nextQuota,
          pass: chainOk
        };
      });

      const latest = rebuilt.latestRound;
      const previousQuota = latest?.startQuota ?? null;
      const adjustment = latest?.quotaMovement ?? null;
      const finalCurrentQuota = rebuilt.currentQuota;
      const displayPass = latest
        ? previousQuota === latest.startQuota && adjustment === latest.quotaMovement && finalCurrentQuota === latest.nextQuota
        : finalCurrentQuota === player.currentQuota;

      return {
        playerName: player.name,
        finalCurrentQuota,
        displayedPreviousQuota: previousQuota,
        displayedAdjustment: adjustment,
        rounds: roundChecks,
        pass: roundChecks.every((round) => round.pass) && displayPass
      };
    });

    console.log(JSON.stringify({ dbPath, summary }, null, 2));
  } finally {
    db.close();
  }
}

main();
