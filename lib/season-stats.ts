import { prisma } from "@/lib/prisma";
import {
  calculatePayoutPredictions,
  calculateRoundRows,
  calculateSideGameResults,
  holeFieldNames,
  parseGoodSkinEntriesInput,
  type RoundMode,
  type ScoringEntryMode,
  type TeamCode
} from "@/lib/quota";
import { getSeasonConfig } from "@/lib/season";

export const ENABLE_SEASON_STATS = true;
export const SEASON_STATS_MIN_RATE_ROUNDS = 3;

export type SeasonStatsEntryInput = {
  playerId: string;
  playerName: string;
  team: TeamCode | null;
  holeScores: Array<number | null>;
  startQuota: number;
  scoringEntryMode?: ScoringEntryMode;
  quickFrontNine?: number | null;
  quickBackNine?: number | null;
  birdieHolesCsv?: string | null;
};

export type SeasonStatsRoundInput = {
  id: string;
  roundName: string;
  roundDate: Date;
  completedAt: Date | null;
  canceledAt?: Date | null;
  isTestRound?: boolean;
  roundMode: RoundMode;
  scoringEntryMode?: ScoringEntryMode;
  entries: SeasonStatsEntryInput[];
};

export type SeasonStatsPlayerRow = {
  playerId: string;
  playerName: string;
  roundsPlayed: number;
  moneyWon: number;
  moneyPerRound: number;
  indyWins: number;
  indyCashes: number;
  indyCashRate: number;
  teamWins: number;
  teamCashes: number;
  teamCashRate: number;
};

export type SeasonStatsData = {
  seasonYear: number;
  seasonStartDate: Date;
  roundsCount: number;
  bartenderTip: number;
  players: SeasonStatsPlayerRow[];
  leaders: {
    money: SeasonStatsPlayerRow | null;
    indy: SeasonStatsPlayerRow | null;
    team: SeasonStatsPlayerRow | null;
  };
  leaderboards: {
    moneyWon: SeasonStatsPlayerRow[];
    indyWins: SeasonStatsPlayerRow[];
    indyCashes: SeasonStatsPlayerRow[];
    teamWins: SeasonStatsPlayerRow[];
    teamCashes: SeasonStatsPlayerRow[];
    roundsPlayed: SeasonStatsPlayerRow[];
  };
  rateLeaderboards: {
    moneyPerRound: SeasonStatsPlayerRow[];
    indyCashRate: SeasonStatsPlayerRow[];
    teamCashRate: SeasonStatsPlayerRow[];
  };
};

function normalizeRoundMode(value: string | null | undefined): RoundMode {
  return value === "SKINS_ONLY" ? "SKINS_ONLY" : "MATCH_QUOTA";
}

function normalizeScoringEntryMode(value: string | null | undefined): ScoringEntryMode {
  return value === "QUICK" ? "QUICK" : "DETAILED";
}

function createEmptyPlayer(playerId: string, playerName: string): SeasonStatsPlayerRow {
  return {
    playerId,
    playerName,
    roundsPlayed: 0,
    moneyWon: 0,
    moneyPerRound: 0,
    indyWins: 0,
    indyCashes: 0,
    indyCashRate: 0,
    teamWins: 0,
    teamCashes: 0,
    teamCashRate: 0
  };
}

function getOrCreatePlayer(
  statsByPlayer: Map<string, SeasonStatsPlayerRow>,
  playerId: string,
  playerName: string
) {
  const existing = statsByPlayer.get(playerId);

  if (existing) {
    return existing;
  }

  const created = createEmptyPlayer(playerId, playerName);
  statsByPlayer.set(playerId, created);
  return created;
}

function sortLeaderboard(
  rows: SeasonStatsPlayerRow[],
  selector: (row: SeasonStatsPlayerRow) => number
) {
  return [...rows]
    .filter((row) => selector(row) > 0)
    .sort((left, right) => {
      const valueDifference = selector(right) - selector(left);
      if (valueDifference !== 0) {
        return valueDifference;
      }

      if (right.moneyWon !== left.moneyWon) {
        return right.moneyWon - left.moneyWon;
      }

      return left.playerName.localeCompare(right.playerName);
    })
    .slice(0, 10);
}

function sortRateLeaderboard(
  rows: SeasonStatsPlayerRow[],
  selector: (row: SeasonStatsPlayerRow) => number
) {
  return sortLeaderboard(
    rows.filter((row) => row.roundsPlayed >= SEASON_STATS_MIN_RATE_ROUNDS),
    selector
  );
}

export function calculateSeasonStatsFromRounds(
  rounds: SeasonStatsRoundInput[],
  options?: {
    seasonStartDate?: Date;
    seasonYear?: number;
  }
): SeasonStatsData {
  const seasonStartDate = options?.seasonStartDate ?? new Date("2026-01-01T00:00:00.000Z");
  const seasonYear = options?.seasonYear ?? seasonStartDate.getFullYear();
  const statsByPlayer = new Map<string, SeasonStatsPlayerRow>();
  let roundsCount = 0;
  let bartenderTip = 0;

  const finalizedRounds = rounds.filter(
    (round) =>
      round.completedAt &&
      !round.canceledAt &&
      !round.isTestRound &&
      round.completedAt >= seasonStartDate
  );

  for (const round of finalizedRounds) {
    roundsCount += 1;
    const scoringEntryMode = normalizeScoringEntryMode(round.scoringEntryMode);
    const rows = calculateRoundRows(
      round.entries.map((entry) => ({
        playerId: entry.playerId,
        playerName: entry.playerName,
        team: entry.team,
        holeScores: entry.holeScores,
        startQuota: entry.startQuota,
        scoringEntryMode,
        quickFrontNine: entry.quickFrontNine ?? null,
        quickBackNine: entry.quickBackNine ?? null,
        birdieHoles: parseGoodSkinEntriesInput(entry.birdieHolesCsv ?? "").map(
          (skin) => skin.holeNumber
        ),
        goodSkinEntries: parseGoodSkinEntriesInput(entry.birdieHolesCsv ?? "")
      }))
    );

    const sideGames = calculateSideGameResults(rows);
    const payouts = calculatePayoutPredictions(rows, {
      includeTeamPayouts: round.roundMode !== "SKINS_ONLY",
      includeIndividualPayouts: true,
      includeSkinsPayouts: true
    });

    bartenderTip +=
      payouts.frontBarRemainder +
      payouts.backBarRemainder +
      payouts.totalBarRemainder +
      payouts.indyBarRemainder +
      payouts.skinsBarRemainder;

    const payoutByPlayer = new Map(payouts.players.map((player) => [player.playerId, player]));
    const indyPayoutByPlayer = new Map(
      sideGames.individualPayouts.map((payout) => [payout.playerId, payout])
    );

    for (const row of rows) {
      const stats = getOrCreatePlayer(statsByPlayer, row.playerId, row.playerName);
      const payout = payoutByPlayer.get(row.playerId);
      const indyPayout = indyPayoutByPlayer.get(row.playerId);
      const teamCashCount =
        Number((payout?.front ?? 0) > 0) +
        Number((payout?.back ?? 0) > 0) +
        Number((payout?.total ?? 0) > 0);

      stats.roundsPlayed += 1;
      stats.moneyWon += payout?.projectedTotal ?? 0;
      stats.indyCashes += Number((indyPayout?.payout ?? 0) > 0);
      stats.indyWins += Number((indyPayout?.payout ?? 0) > 0 && indyPayout?.rank === 1);
      stats.teamWins += teamCashCount;
      stats.teamCashes += Number(teamCashCount > 0);
    }
  }

  const players = Array.from(statsByPlayer.values()).map((row) => {
    const roundsPlayed = Math.max(0, row.roundsPlayed);
    return {
      ...row,
      moneyWon: Math.floor(row.moneyWon),
      moneyPerRound: roundsPlayed > 0 ? row.moneyWon / roundsPlayed : 0,
      indyCashRate: roundsPlayed > 0 ? row.indyCashes / roundsPlayed : 0,
      teamCashRate: roundsPlayed > 0 ? row.teamCashes / roundsPlayed : 0
    };
  }).sort((left, right) => {
    if (right.moneyWon !== left.moneyWon) {
      return right.moneyWon - left.moneyWon;
    }

    return left.playerName.localeCompare(right.playerName);
  });

  const moneyWon = sortLeaderboard(players, (row) => row.moneyWon);
  const indyWins = sortLeaderboard(players, (row) => row.indyWins);
  const indyCashes = sortLeaderboard(players, (row) => row.indyCashes);
  const teamWins = sortLeaderboard(players, (row) => row.teamWins);
  const teamCashes = sortLeaderboard(players, (row) => row.teamCashes);
  const roundsPlayed = sortLeaderboard(players, (row) => row.roundsPlayed);
  const moneyPerRound = sortRateLeaderboard(players, (row) => row.moneyPerRound);
  const indyCashRate = sortRateLeaderboard(players, (row) => row.indyCashRate);
  const teamCashRate = sortRateLeaderboard(players, (row) => row.teamCashRate);

  return {
    seasonYear,
    seasonStartDate,
    roundsCount,
    bartenderTip: Math.floor(bartenderTip),
    players,
    leaders: {
      money: moneyWon[0] ?? null,
      indy: indyWins[0] ?? null,
      team: teamWins[0] ?? null
    },
    leaderboards: {
      moneyWon,
      indyWins,
      indyCashes,
      teamWins,
      teamCashes,
      roundsPlayed
    },
    rateLeaderboards: {
      moneyPerRound,
      indyCashRate,
      teamCashRate
    }
  };
}

export async function getExperimentalSeasonStatsData() {
  const seasonConfig = await getSeasonConfig(prisma);
  const rounds = await prisma.round.findMany({
    where: {
      completedAt: {
        not: null,
        gte: seasonConfig.seasonStartDate
      },
      canceledAt: null,
      isTestRound: false
    },
    include: {
      entries: {
        include: {
          player: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: {
          rank: "asc"
        }
      }
    },
    orderBy: [{ completedAt: "asc" }, { roundDate: "asc" }, { createdAt: "asc" }]
  });

  return calculateSeasonStatsFromRounds(
    rounds.map((round) => ({
      id: round.id,
      roundName: round.roundName,
      roundDate: round.roundDate,
      completedAt: round.completedAt,
      canceledAt: round.canceledAt,
      isTestRound: round.isTestRound,
      roundMode: normalizeRoundMode(round.roundMode),
      scoringEntryMode: normalizeScoringEntryMode(round.scoringEntryMode),
      entries: round.entries.map((entry) => ({
        playerId: entry.playerId,
        playerName: entry.player?.name ?? "Unknown Player",
        team: (entry.team as TeamCode | null) ?? null,
        holeScores: holeFieldNames.map((fieldName) => entry[fieldName]),
        startQuota: entry.startQuota,
        scoringEntryMode: normalizeScoringEntryMode(round.scoringEntryMode),
        quickFrontNine: entry.quickFrontNine,
        quickBackNine: entry.quickBackNine,
        birdieHolesCsv: entry.birdieHolesCsv
      }))
    })),
    {
      seasonStartDate: seasonConfig.seasonStartDate,
      seasonYear: seasonConfig.seasonStartDate.getFullYear()
    }
  );
}
