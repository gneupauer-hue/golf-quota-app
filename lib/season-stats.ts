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

// Season birdie/eagle/ace counts. Quick-entry rounds store these as manual
// good-skin entries (birdieHolesCsv). Hole-by-hole rounds leave that field empty
// and instead record the result in the per-hole points, where 4 = birdie,
// 6 = eagle, 8 = ace. Prefer the stored entries when present; otherwise derive
// from the hole points so hole-by-hole rounds are counted too.
export function countGoodSkinsForEntry(
  birdieHolesCsv: string | null | undefined,
  holeScores: Array<number | null> | null | undefined
): { birdies: number; eagles: number; albatrosses: number; hios: number } {
  const stored = parseGoodSkinEntriesInput(birdieHolesCsv ?? "");
  if (stored.length > 0) {
    let birdies = 0;
    let eagles = 0;
    let hios = 0;
    for (const skin of stored) {
      if (skin.type === "eagle") eagles += 1;
      else if (skin.type === "ace") hios += 1;
      else birdies += 1;
    }
    // Quick-entry good skins are birdie/eagle/ace only — no albatross type.
    return { birdies, eagles, albatrosses: 0, hios };
  }

  // Hole-by-hole points: 4 = birdie, 6 = eagle, 8 = albatross (double eagle).
  // A hole-in-one isn't derivable from points alone, so aces aren't counted here.
  let birdies = 0;
  let eagles = 0;
  let albatrosses = 0;
  for (const score of holeScores ?? []) {
    if (score === 4) birdies += 1;
    else if (score === 6) eagles += 1;
    else if (score === 8) albatrosses += 1;
  }
  return { birdies, eagles, albatrosses, hios: 0 };
}

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
  birdies: number;
  birdiesPerRound: number;
  eagles: number;
  albatrosses: number;
  hios: number;
  paidSkins: number;
  paidSkinsPerRound: number;
  indyWins: number;
  indyCashes: number;
  indyCashRate: number;
  teamEvents: number;
  teamCashRounds: number;
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
    birdies: SeasonStatsPlayerRow | null;
    skins: SeasonStatsPlayerRow | null;
    indy: SeasonStatsPlayerRow | null;
  };
  leaderboards: {
    moneyWon: SeasonStatsPlayerRow[];
    birdies: SeasonStatsPlayerRow[];
    eagles: SeasonStatsPlayerRow[];
    albatrosses: SeasonStatsPlayerRow[];
    hios: SeasonStatsPlayerRow[];
    paidSkins: SeasonStatsPlayerRow[];
    individualQuota: SeasonStatsPlayerRow[];
    teamEvents: SeasonStatsPlayerRow[];
    roundsPlayed: SeasonStatsPlayerRow[];
  };
  rateLeaderboards: {
    moneyPerRound: SeasonStatsPlayerRow[];
    birdiesPerRound: SeasonStatsPlayerRow[];
    paidSkinsPerRound: SeasonStatsPlayerRow[];
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
    birdies: 0,
    birdiesPerRound: 0,
    eagles: 0,
    albatrosses: 0,
    hios: 0,
    paidSkins: 0,
    paidSkinsPerRound: 0,
    indyWins: 0,
    indyCashes: 0,
    indyCashRate: 0,
    teamEvents: 0,
    teamCashRounds: 0,
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
    const paidSkinsByPlayer = new Map(
      sideGames.skins.winners.map((winner) => [winner.playerId, winner.skinsWon])
    );
    const indyPayoutByPlayer = new Map(
      sideGames.individualPayouts.map((payout) => [payout.playerId, payout])
    );

    for (const row of rows) {
      const stats = getOrCreatePlayer(statsByPlayer, row.playerId, row.playerName);
      const payout = payoutByPlayer.get(row.playerId);
      const indyPayout = indyPayoutByPlayer.get(row.playerId);
      const teamEventCount =
        Number((payout?.front ?? 0) > 0) +
        Number((payout?.back ?? 0) > 0) +
        Number((payout?.total ?? 0) > 0);
      const seasonEntry = round.entries.find((entry) => entry.playerId === row.playerId);
      const goodSkins = countGoodSkinsForEntry(
        seasonEntry?.birdieHolesCsv,
        seasonEntry?.holeScores ?? row.holeScores
      );

      stats.roundsPlayed += 1;
      stats.moneyWon += payout?.projectedTotal ?? 0;
      stats.paidSkins += paidSkinsByPlayer.get(row.playerId) ?? 0;
      stats.indyCashes += Number((indyPayout?.payout ?? 0) > 0);
      stats.indyWins += Number((indyPayout?.payout ?? 0) > 0 && indyPayout?.rank === 1);
      stats.teamEvents += teamEventCount;
      stats.teamCashRounds += Number(teamEventCount > 0);

      stats.birdies += goodSkins.birdies;
      stats.eagles += goodSkins.eagles;
      stats.albatrosses += goodSkins.albatrosses;
      stats.hios += goodSkins.hios;
    }
  }

  const players = Array.from(statsByPlayer.values()).map((row) => {
    const roundsPlayed = Math.max(0, row.roundsPlayed);
    return {
      ...row,
      moneyWon: Math.floor(row.moneyWon),
      moneyPerRound: roundsPlayed > 0 ? row.moneyWon / roundsPlayed : 0,
      birdiesPerRound: roundsPlayed > 0 ? row.birdies / roundsPlayed : 0,
      paidSkinsPerRound: roundsPlayed > 0 ? row.paidSkins / roundsPlayed : 0,
      indyCashRate: roundsPlayed > 0 ? row.indyCashes / roundsPlayed : 0,
      teamCashRate: roundsPlayed > 0 ? row.teamCashRounds / roundsPlayed : 0
    };
  }).sort((left, right) => {
    if (right.moneyWon !== left.moneyWon) {
      return right.moneyWon - left.moneyWon;
    }

    return left.playerName.localeCompare(right.playerName);
  });

  const moneyWon = sortLeaderboard(players, (row) => row.moneyWon);
  const birdies = sortLeaderboard(players, (row) => row.birdies);
  const eagles = sortLeaderboard(players, (row) => row.eagles);
  const albatrosses = sortLeaderboard(players, (row) => row.albatrosses);
  const hios = sortLeaderboard(players, (row) => row.hios);
  const paidSkins = sortLeaderboard(players, (row) => row.paidSkins);
  const individualQuota = sortLeaderboard(players, (row) => row.indyCashes);
  const teamEvents = sortLeaderboard(players, (row) => row.teamEvents);
  const roundsPlayed = sortLeaderboard(players, (row) => row.roundsPlayed);
  const moneyPerRound = sortRateLeaderboard(players, (row) => row.moneyPerRound);
  const birdiesPerRound = sortRateLeaderboard(players, (row) => row.birdiesPerRound);
  const paidSkinsPerRound = sortRateLeaderboard(players, (row) => row.paidSkinsPerRound);
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
      birdies: birdies[0] ?? null,
      skins: paidSkins[0] ?? null,
      indy: individualQuota[0] ?? null
    },
    leaderboards: {
      moneyWon,
      birdies,
      eagles,
      albatrosses,
      hios,
      paidSkins,
      individualQuota,
      teamEvents,
      roundsPlayed
    },
    rateLeaderboards: {
      moneyPerRound,
      birdiesPerRound,
      paidSkinsPerRound,
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
