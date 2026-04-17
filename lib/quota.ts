export type ScoringRule = {
  label: string;
  value: number;
};

export type RoundMode = "MATCH_QUOTA" | "SKINS_ONLY";

export const holeScoreValues = [-1, 0, 1, 2, 4, 6] as const;
export const teamOptions = ["A", "B", "C", "D", "E", "F"] as const;
export const holeFieldNames = [
  "hole1",
  "hole2",
  "hole3",
  "hole4",
  "hole5",
  "hole6",
  "hole7",
  "hole8",
  "hole9",
  "hole10",
  "hole11",
  "hole12",
  "hole13",
  "hole14",
  "hole15",
  "hole16",
  "hole17",
  "hole18"
] as const;
export const holeNumbers = Array.from({ length: holeFieldNames.length }, (_, index) => index + 1);
export type TeamCode = (typeof teamOptions)[number];

export const scoringRules: ScoringRule[] = [
  { label: "Eagle", value: 6 },
  { label: "Birdie", value: 4 },
  { label: "Par", value: 2 },
  { label: "Bogey", value: 1 },
  { label: "Double+", value: 0 },
  { label: "Triple", value: -1 }
];

export type RoundRowInput = {
  playerId: string;
  playerName: string;
  team: TeamCode | null;
  holeScores: Array<number | null>;
  startQuota: number;
};

export type CalculatedRoundRow = RoundRowInput & {
  frontQuota: number;
  backQuota: number;
  frontNine: number;
  backNine: number;
  frontPlusMinus: number;
  backPlusMinus: number;
  totalPoints: number;
  plusMinus: number;
  nextQuota: number;
  rank: number;
};

export type TeamStanding = {
  team: TeamCode;
  players: string[];
  frontPoints: number;
  backPoints: number;
  totalPoints: number;
  frontQuota: number;
  backQuota: number;
  totalQuota: number;
  frontPlusMinus: number;
  backPlusMinus: number;
  totalPlusMinus: number;
};

export type TeamPotResult = {
  frontPot: number;
  backPot: number;
  totalPot: number;
  frontWinner: TeamStanding | null;
  backWinner: TeamStanding | null;
  totalWinner: TeamStanding | null;
};

export type SkinHoleResult = {
  holeNumber: number;
  eligiblePlayerIds: string[];
  eligibleNames: string[];
  carryover: boolean;
  skinAwarded: boolean;
  winnerPlayerId: string | null;
  winnerName: string | null;
  sharesCaptured: number;
  activeCarryover: boolean;
};

export type SkinWinnerResult = {
  playerId: string;
  playerName: string;
  skinsWon: number;
  payout: number;
};

export type SkinsResult = {
  totalPot: number;
  totalSkinSharesWon: number;
  valuePerSkin: number;
  currentCarryoverCount: number;
  currentCarryoverHoles: number[];
  holes: SkinHoleResult[];
  winners: SkinWinnerResult[];
};

export type SideGameResults = {
  overallPot: {
    playerCount: number;
    totalPot: number;
    teamPot: number;
    frontPot: number;
    backPot: number;
    totalTeamPot: number;
    indyPot: number;
    skinsPot: number;
    placesPaid: number;
  };
  teamPots: TeamPotResult;
  individualPayouts: Array<{
    playerId: string;
    playerName: string;
    rank: number;
    plusMinus: number;
    totalPoints: number;
    tied: boolean;
    placeLabel: string;
    payout: number;
  }>;
  payoutByPlace: Array<{
    place: number;
    payout: number;
    playerNames: string[];
  }>;
  cashers: Array<{
    playerId: string;
    playerName: string;
    plusMinus: number;
    payout: number;
    placeLabel: string;
  }>;
  skins: SkinsResult;
};

export type LiveLeaders = {
  leaderGroup: CalculatedRoundRow[];
  payoutGroup: CalculatedRoundRow[];
  first: CalculatedRoundRow | null;
  second: CalculatedRoundRow | null;
  third: CalculatedRoundRow | null;
  frontTeam: TeamStanding | null;
  backTeam: TeamStanding | null;
  totalTeam: TeamStanding | null;
};

export type LiveProjection = {
  leaderLabel: string;
  margin: number;
  probability: number;
  holesRemaining: number;
};

export type SkinsProjection = {
  heading: string;
  detail: string;
  probability: number | null;
};

export type LiveProjections = {
  frontTeam: LiveProjection | null;
  backTeam: LiveProjection | null;
  totalTeam: LiveProjection | null;
  individual: LiveProjection | null;
  skins: SkinsProjection;
};

export type IndividualPayoutProjection = {
  place: number;
  placeLabel: string;
  playerId: string;
  playerName: string;
  payout: number;
  probability: number;
  margin: number;
  holesRemaining: number;
};

export type PlayerPayoutPrediction = {
  playerId: string;
  playerName: string;
  front: number;
  back: number;
  total: number;
  indy: number;
  skins: number;
  projectedTotal: number;
};

export type PayoutPredictionsSummary = {
  players: PlayerPayoutPrediction[];
  frontProjectedTotal: number;
  backProjectedTotal: number;
  totalProjectedTotal: number;
  indyProjectedTotal: number;
  skinsProjectedTotal: number;
  frontBarRemainder: number;
  backBarRemainder: number;
  totalBarRemainder: number;
  indyBarRemainder: number;
  skinsBarRemainder: number;
  barRemainder: number;
  frontPot: number;
  backPot: number;
  totalPot: number;
  indyPot: number;
  skinsPot: number;
  frontDifference: number;
  backDifference: number;
  totalDifference: number;
  indyDifference: number;
  skinsDifference: number;
  moneyCurrentlyInPlay: number;
  overallPot: number;
  overallDifference: number;
  projectedPayoutTotal: number;
  unsettledSkinsValue: number;
  mismatchedCategories: Array<"front" | "back" | "total" | "indy" | "skins" | "overall">;
  isBalanced: boolean;
};

const birdieOrBetterValues = new Set<number>([4, 6]);
const individualPayoutTable: Record<number, number[]> = {
  4: [20],
  6: [40, 20],
  7: [45, 25],
  8: [55, 25],
  9: [55, 25, 10],
  10: [60, 30, 10],
  11: [65, 35, 10],
  12: [70, 35, 15],
  13: [65, 40, 20, 5],
  14: [70, 40, 20, 10],
  15: [75, 45, 25, 5],
  16: [80, 50, 25, 5]
};

export function sumHoleScores(holeScores: Array<number | null>): number {
  return holeScores.reduce<number>((total, value) => total + (value ?? 0), 0);
}

export function calculateTotals(holeScores: Array<number | null>) {
  const frontNine = sumHoleScores(holeScores.slice(0, 9));
  const backNine = sumHoleScores(holeScores.slice(9, 18));
  const totalPoints = frontNine + backNine;

  return {
    frontNine,
    backNine,
    totalPoints
  };
}

export function getCompletedHoleCount(holeScores: Array<number | null>) {
  let count = 0;
  for (const score of holeScores) {
    if (score === null || score === undefined) {
      break;
    }
    count += 1;
  }
  return count;
}

export function hasSequentialHoleEntry(holeScores: Array<number | null>) {
  let seenEmpty = false;
  for (const score of holeScores) {
    if (score === null || score === undefined) {
      seenEmpty = true;
      continue;
    }
    if (seenEmpty) {
      return false;
    }
  }
  return true;
}

export function isRoundRowComplete(holeScores: Array<number | null>) {
  return getCompletedHoleCount(holeScores) === holeFieldNames.length;
}

export function splitQuota(startQuota: number) {
  const frontQuota = Math.ceil(startQuota / 2);
  const backQuota = startQuota - frontQuota;

  return {
    frontQuota,
    backQuota
  };
}

export function calculateNextQuota(startQuota: number, totalPoints: number) {
  const plusMinus = totalPoints - startQuota;

  if (plusMinus < 0) {
    return {
      plusMinus,
      nextQuota: Math.ceil(startQuota - 1)
    };
  }

  if (plusMinus === 0) {
    return {
      plusMinus,
      nextQuota: Math.ceil(startQuota)
    };
  }

  return {
    plusMinus,
    nextQuota: Math.ceil(startQuota + Math.min(2, plusMinus / 2))
  };
}

export function calculateRoundRows(rows: RoundRowInput[]): CalculatedRoundRow[] {
  const withScores = rows.map((row) => {
    const { frontNine, backNine, totalPoints } = calculateTotals(row.holeScores);
    const { frontQuota, backQuota } = splitQuota(row.startQuota);
    const { plusMinus, nextQuota } = calculateNextQuota(row.startQuota, totalPoints);
    const frontPlusMinus = frontNine - frontQuota;
    const backPlusMinus = backNine - backQuota;

    return {
      ...row,
      frontQuota,
      backQuota,
      frontNine,
      backNine,
      frontPlusMinus,
      backPlusMinus,
      totalPoints,
      plusMinus,
      nextQuota,
      rank: 0
    };
  });

  const ranked = [...withScores].sort((a, b) => {
    if (b.plusMinus !== a.plusMinus) {
      return b.plusMinus - a.plusMinus;
    }

    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }

    return a.playerName.localeCompare(b.playerName);
  });

  const ranks = new Map<string, number>();
  ranked.forEach((row, index) => {
    ranks.set(row.playerId, index + 1);
  });

  return withScores.map((row) => ({
    ...row,
    rank: ranks.get(row.playerId) ?? 0
  }));
}

export function formatPlusMinus(value: number) {
  if (value > 0) {
    return `+${value}`;
  }

  return `${value}`;
}

export function getRankTone(row: { rank: number; plusMinus: number }) {
  if (row.plusMinus < 0) {
    return "negative";
  }

  if (row.rank === 1) {
    return "first";
  }

  if (row.rank === 2) {
    return "second";
  }

  if (row.rank === 3) {
    return "third";
  }

  return "default";
}

export function calculateTeamStandings(rows: CalculatedRoundRow[]): TeamStanding[] {
  const grouped = new Map<TeamCode, TeamStanding>();

  for (const row of rows) {
    if (!row.team) {
      continue;
    }

    const current =
      grouped.get(row.team) ??
      {
        team: row.team,
        players: [],
        frontPoints: 0,
        backPoints: 0,
        totalPoints: 0,
        frontQuota: 0,
        backQuota: 0,
        totalQuota: 0,
        frontPlusMinus: 0,
        backPlusMinus: 0,
        totalPlusMinus: 0
      };

    current.players.push(row.playerName);
    current.frontPoints += row.frontNine;
    current.backPoints += row.backNine;
    current.totalPoints += row.totalPoints;
    current.frontQuota += row.frontQuota;
    current.backQuota += row.backQuota;
    current.totalQuota += row.startQuota;
    current.frontPlusMinus = current.frontPoints - current.frontQuota;
    current.backPlusMinus = current.backPoints - current.backQuota;
    current.totalPlusMinus = current.totalPoints - current.totalQuota;

    grouped.set(row.team, current);
  }

  return Array.from(grouped.values()).sort((a, b) => {
    if (b.totalPlusMinus !== a.totalPlusMinus) {
      return b.totalPlusMinus - a.totalPlusMinus;
    }

    return a.team.localeCompare(b.team);
  });
}

function pickWinningTeam(teams: TeamStanding[], key: keyof Pick<TeamStanding, "frontPlusMinus" | "backPlusMinus" | "totalPlusMinus">) {
  const sorted = [...teams].sort((a, b) => {
    if (b[key] !== a[key]) {
      return b[key] - a[key];
    }

    return a.team.localeCompare(b.team);
  });

  return sorted[0] ?? null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function logistic(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function sampleStandardDeviation(values: number[]) {
  if (values.length <= 1) {
    return 0;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);

  return Math.sqrt(variance);
}

function estimateWinProbabilityFromState({
  margin,
  completed,
  total,
  perHoleVolatility,
  competitors
}: {
  margin: number;
  completed: number;
  total: number;
  perHoleVolatility: number;
  competitors: number;
}) {
  const remaining = Math.max(0, total - completed);

  if (remaining === 0) {
    return margin > 0 ? 100 : 50;
  }

  const progress = total > 0 ? completed / total : 0;
  const volatilityFloor = 1.15;
  const adjustedVolatility = Math.max(volatilityFloor, perHoleVolatility);
  const chasePressure = 1 + Math.max(0, competitors - 2) * 0.18;
  const uncertainty = adjustedVolatility * Math.sqrt(remaining) * chasePressure;
  const paceBonus = progress * 0.75;
  const marginScore = margin / uncertainty;
  const probability = logistic(marginScore + paceBonus) * 100;

  return clamp(Math.round(probability), 50, 99);
}

function calculateHoleSpread(values: number[]) {
  if (values.length <= 1) {
    return 0;
  }

  return Math.max(...values) - Math.min(...values);
}

function calculateIndividualPerHoleVolatility(rows: CalculatedRoundRow[], holesToCheck: number) {
  const spreads: number[] = [];

  for (let holeIndex = 0; holeIndex < holesToCheck; holeIndex += 1) {
    const completedScores = rows
      .map((row) => row.holeScores[holeIndex])
      .filter((score): score is number => score != null);

    if (completedScores.length >= 2) {
      spreads.push(calculateHoleSpread(completedScores));
    }
  }

  return spreads.length ? sampleStandardDeviation(spreads) || spreads.reduce((sum, value) => sum + value, 0) / spreads.length : 2.2;
}

function calculateTeamPerHoleVolatility(
  rows: CalculatedRoundRow[],
  teams: TeamStanding[],
  startHoleIndex: number,
  endHoleIndex: number
) {
  const spreads: number[] = [];

  for (let holeIndex = startHoleIndex; holeIndex < endHoleIndex; holeIndex += 1) {
    const teamHoleTotals = teams
      .map((team) => {
        const scores = rows
          .filter((row) => row.team === team.team)
          .map((row) => row.holeScores[holeIndex])
          .filter((score): score is number => score != null);

        if (!scores.length) {
          return null;
        }

        return scores.reduce((sum, score) => sum + score, 0);
      })
      .filter((value): value is number => value != null);

    if (teamHoleTotals.length >= 2) {
      spreads.push(calculateHoleSpread(teamHoleTotals));
    }
  }

  return spreads.length ? sampleStandardDeviation(spreads) || spreads.reduce((sum, value) => sum + value, 0) / spreads.length : 2.5;
}

export function calculateLiveLeaders(rows: CalculatedRoundRow[]) {
  const ranked = [...rows].sort((a, b) => {
    if (b.plusMinus !== a.plusMinus) {
      return b.plusMinus - a.plusMinus;
    }

    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }

    return a.playerName.localeCompare(b.playerName);
  });

  const teams = calculateTeamStandings(rows);
  const leaderCount = Math.max(1, Math.ceil(ranked.length * 0.25));
  const payoutCount = Math.max(1, Math.ceil(ranked.length * 0.25));

  return {
    leaderGroup: ranked.slice(0, leaderCount),
    payoutGroup: ranked.slice(0, payoutCount),
    first: ranked[0] ?? null,
    second: ranked[1] ?? null,
    third: ranked[2] ?? null,
    frontTeam: pickWinningTeam(teams, "frontPlusMinus"),
    backTeam: pickWinningTeam(teams, "backPlusMinus"),
    totalTeam: pickWinningTeam(teams, "totalPlusMinus")
  } satisfies LiveLeaders;
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isCurrencyMatch(allocated: number, pot: number) {
  return roundCurrency(allocated) === roundCurrency(pot);
}

function floorWholeDollar(value: number) {
  return Math.floor(roundCurrency(value));
}

function splitCurrencyAcrossKeys(total: number, keys: string[]) {
  const allocations = new Map<string, number>();
  const uniqueKeys = [...new Set(keys)].sort((a, b) => a.localeCompare(b));

  if (!uniqueKeys.length || total <= 0) {
    return allocations;
  }

  const totalCents = Math.round(total * 100);
  const base = Math.floor(totalCents / uniqueKeys.length);
  let remainder = totalCents - base * uniqueKeys.length;

  uniqueKeys.forEach((key) => {
    const cents = base + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    allocations.set(key, cents / 100);
  });

  return allocations;
}

function formatPlaceLabel(startPlace: number, endPlace: number) {
  if (startPlace === endPlace) {
    return `${startPlace}`;
  }

  return `${startPlace}-${endPlace}`;
}

function getPlacesPaid(playerCount: number) {
  return individualPayoutTable[playerCount]?.length ?? 0;
}

function getIndividualPayoutTable(playerCount: number) {
  const exactTable = individualPayoutTable[playerCount];
  if (exactTable) {
    return exactTable;
  }
  return [];
}

function buildRankedGroups(rows: CalculatedRoundRow[]) {
  const ranked = [...rows].sort((a, b) => {
    if (b.plusMinus !== a.plusMinus) {
      return b.plusMinus - a.plusMinus;
    }

    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }

    return a.playerName.localeCompare(b.playerName);
  });

  const groups: Array<{
    rows: CalculatedRoundRow[];
    startPlace: number;
    endPlace: number;
  }> = [];

  let index = 0;
  while (index < ranked.length) {
    const anchor = ranked[index];
    const tiedRows = [anchor];
    let cursor = index + 1;

    while (
      cursor < ranked.length &&
      ranked[cursor].plusMinus === anchor.plusMinus &&
      ranked[cursor].totalPoints === anchor.totalPoints
    ) {
      tiedRows.push(ranked[cursor]);
      cursor += 1;
    }

    groups.push({
      rows: tiedRows,
      startPlace: index + 1,
      endPlace: index + tiedRows.length
    });
    index = cursor;
  }

  return groups;
}

function calculateIndividualPayouts(rows: CalculatedRoundRow[]) {
  const placesPaid = getPlacesPaid(rows.length);
  const payoutTable = getIndividualPayoutTable(rows.length);
  const rankedGroups = buildRankedGroups(rows);
  const payouts: SideGameResults["individualPayouts"] = [];
  const payoutByPlace = new Map<number, { place: number; payout: number; playerNames: string[] }>();

  for (const group of rankedGroups) {
    if (group.startPlace > placesPaid) {
      break;
    }

    const coveredPayouts = payoutTable.slice(group.startPlace - 1, Math.min(group.endPlace, placesPaid));
    const splitPayout = coveredPayouts.length
      ? roundCurrency(coveredPayouts.reduce((sum, amount) => sum + amount, 0) / group.rows.length)
      : 0;

    for (const row of group.rows) {
      payouts.push({
        playerId: row.playerId,
        playerName: row.playerName,
        rank: row.rank,
        plusMinus: row.plusMinus,
        totalPoints: row.totalPoints,
        tied: group.rows.length > 1,
        placeLabel: formatPlaceLabel(group.startPlace, Math.min(group.endPlace, placesPaid)),
        payout: splitPayout
      });

      const coveredPlaces = Array.from(
        { length: Math.max(0, Math.min(group.endPlace, placesPaid) - group.startPlace + 1) },
        (_, index) => group.startPlace + index
      );
      for (const place of coveredPlaces) {
        const current = payoutByPlace.get(place) ?? {
          place,
          payout: splitPayout,
          playerNames: []
        };
        current.payout = splitPayout;
        current.playerNames.push(row.playerName);
        payoutByPlace.set(place, current);
      }
    }
  }

  return {
    placesPaid,
    payouts,
    payoutByPlace: Array.from(payoutByPlace.values()).sort((a, b) => a.place - b.place)
  };
}

function getProjectedWinningTeams(
  teams: TeamStanding[],
  key: keyof Pick<TeamStanding, "frontPlusMinus" | "backPlusMinus" | "totalPlusMinus">
) {
  if (!teams.length) {
    return [];
  }

  const bestScore = Math.max(...teams.map((team) => team[key]));
  return teams
    .filter((team) => team[key] === bestScore)
    .sort((a, b) => a.team.localeCompare(b.team));
}

function allocateTeamPotToPlayers(
  rows: CalculatedRoundRow[],
  teams: TeamStanding[],
  key: keyof Pick<TeamStanding, "frontPlusMinus" | "backPlusMinus" | "totalPlusMinus">,
  pot: number
) {
  const projectedTeams = getProjectedWinningTeams(teams, key);
  const allocations = new Map<string, number>();

  if (!projectedTeams.length || pot <= 0) {
    return allocations;
  }

  const teamShares = splitCurrencyAcrossKeys(
    pot,
    projectedTeams.map((team) => team.team)
  );

  projectedTeams.forEach((team) => {
    const teamRows = rows
      .filter((row) => row.team === team.team)
      .sort((a, b) => a.playerName.localeCompare(b.playerName));
    const teamShare = teamShares.get(team.team) ?? 0;
    const playerShares = splitCurrencyAcrossKeys(
      teamShare,
      teamRows.map((row) => row.playerId)
    );

    teamRows.forEach((row) => {
      allocations.set(row.playerId, playerShares.get(row.playerId) ?? 0);
    });
  });

  return allocations;
}

export function calculateGoodSkins(rows: CalculatedRoundRow[]): SkinsResult {
  const totalPot = rows.length * 10;
  const holes: SkinHoleResult[] = [];
  const winnerShares = new Map<string, { playerId: string; playerName: string; skinsWon: number }>();
  const openCarryoverHoles: number[] = [];
  let pendingShares = 1;

  for (let holeIndex = 0; holeIndex < holeNumbers.length; holeIndex += 1) {
    const holeNumber = holeIndex + 1;
    const scoresForHole = rows.map((row) => row.holeScores[holeIndex]);

    if (scoresForHole.some((score) => score == null)) {
      break;
    }

    const eligiblePlayers = rows.filter((row) => birdieOrBetterValues.has(row.holeScores[holeIndex] ?? 0));
    const bestQualifyingScore = eligiblePlayers.reduce<number | null>((best, row) => {
      const score = row.holeScores[holeIndex];
      if (score == null) {
        return best;
      }
      if (best == null || score > best) {
        return score;
      }
      return best;
    }, null);
    const outrightBestPlayers =
      bestQualifyingScore == null
        ? []
        : eligiblePlayers.filter((row) => row.holeScores[holeIndex] === bestQualifyingScore);

    if (outrightBestPlayers.length === 1) {
      const winner = outrightBestPlayers[0];
      const sharesCaptured = pendingShares;
      const currentWinner = winnerShares.get(winner.playerId) ?? {
        playerId: winner.playerId,
        playerName: winner.playerName,
        skinsWon: 0
      };
      currentWinner.skinsWon += sharesCaptured;
      winnerShares.set(winner.playerId, currentWinner);

      holes.push({
        holeNumber,
        eligiblePlayerIds: outrightBestPlayers.map((player) => player.playerId),
        eligibleNames: outrightBestPlayers.map((player) => player.playerName),
        carryover: false,
        skinAwarded: true,
        winnerPlayerId: winner.playerId,
        winnerName: winner.playerName,
        sharesCaptured,
        activeCarryover: false
      });

      openCarryoverHoles.length = 0;
      pendingShares = 1;
      continue;
    }

    openCarryoverHoles.push(holeNumber);
    holes.push({
      holeNumber,
      eligiblePlayerIds: outrightBestPlayers.map((player) => player.playerId),
      eligibleNames: outrightBestPlayers.map((player) => player.playerName),
      carryover: true,
      skinAwarded: false,
      winnerPlayerId: null,
      winnerName: null,
      sharesCaptured: 0,
      activeCarryover: true
    });
    pendingShares += 1;
  }

  const totalSkinSharesWon = Array.from(winnerShares.values()).reduce(
    (total, winner) => total + winner.skinsWon,
    0
  );
  const valuePerSkin = totalSkinSharesWon > 0 ? roundCurrency(totalPot / totalSkinSharesWon) : 0;
  const winners = Array.from(winnerShares.values())
    .map((winner) => ({
      ...winner,
      payout: roundCurrency(winner.skinsWon * valuePerSkin)
    }))
    .sort((a, b) => {
      if (b.skinsWon !== a.skinsWon) {
        return b.skinsWon - a.skinsWon;
      }

      return a.playerName.localeCompare(b.playerName);
    });

  return {
    totalPot,
    totalSkinSharesWon,
    valuePerSkin,
    currentCarryoverCount: openCarryoverHoles.length,
    currentCarryoverHoles: [...openCarryoverHoles],
    holes,
    winners
  };
}

export function calculateSideGameResults(rows: CalculatedRoundRow[]): SideGameResults {
  const liveLeaders = calculateLiveLeaders(rows);
  const indyPot = rows.length * 10;
  const { placesPaid, payouts, payoutByPlace } = calculateIndividualPayouts(rows);
  const skins = calculateGoodSkins(rows);
  const teamPot = rows.length * 20;
  const frontPot = rows.length * 5;
  const backPot = rows.length * 5;
  const totalTeamPot = rows.length * 10;

  return {
    overallPot: {
      playerCount: rows.length,
      totalPot: rows.length * 40,
      teamPot,
      frontPot,
      backPot,
      totalTeamPot,
      indyPot,
      skinsPot: rows.length * 10,
      placesPaid
    },
    teamPots: {
      frontPot,
      backPot,
      totalPot: totalTeamPot,
      frontWinner: liveLeaders.frontTeam,
      backWinner: liveLeaders.backTeam,
      totalWinner: liveLeaders.totalTeam
    },
    individualPayouts: payouts,
    payoutByPlace,
    cashers: payouts.map((player) => ({
      playerId: player.playerId,
      playerName: player.playerName,
      plusMinus: player.plusMinus,
      payout: player.payout,
      placeLabel: player.placeLabel
    })),
    skins
  };
}

export function calculateLiveProjections(rows: CalculatedRoundRow[]): LiveProjections {
  const rankedPlayers = [...rows].sort((a, b) => {
    if (b.plusMinus !== a.plusMinus) {
      return b.plusMinus - a.plusMinus;
    }
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    return a.playerName.localeCompare(b.playerName);
  });
  const teams = calculateTeamStandings(rows);
  const skins = calculateGoodSkins(rows);
  const overallCompleted = rows.length
    ? Math.max(...rows.map((row) => getCompletedHoleCount(row.holeScores)))
    : 0;
  const frontCompleted = Math.min(9, overallCompleted);
  const backCompleted = Math.max(0, Math.min(9, overallCompleted - 9));

  function buildTeamProjection(
    key: keyof Pick<TeamStanding, "frontPlusMinus" | "backPlusMinus" | "totalPlusMinus">,
    label: "front" | "back" | "total"
  ) {
    if (!teams.length) {
      return null;
    }

    const sorted = [...teams].sort((a, b) => {
      if (b[key] !== a[key]) {
        return b[key] - a[key];
      }
      return a.team.localeCompare(b.team);
    });
    const leader = sorted[0];
    const runnerUp = sorted[1];
    const margin = runnerUp ? leader[key] - runnerUp[key] : leader[key];
    const completed = label === "front" ? frontCompleted : label === "back" ? backCompleted : overallCompleted;
    const total = label === "front" || label === "back" ? 9 : 18;
    const perHoleVolatility = calculateTeamPerHoleVolatility(
      rows,
      teams,
      label === "back" ? 9 : 0,
      label === "front" ? 9 : 18
    );

    return {
      leaderLabel: `Team ${leader.team}`,
      margin,
      probability: estimateWinProbabilityFromState({
        margin,
        completed,
        total,
        perHoleVolatility,
        competitors: teams.length
      }),
      holesRemaining: Math.max(0, total - completed)
    } satisfies LiveProjection;
  }

  const individualLeader = rankedPlayers[0] ?? null;
  const individualRunnerUp = rankedPlayers[1] ?? null;
  const individualMargin =
    individualLeader && individualRunnerUp
      ? individualLeader.plusMinus - individualRunnerUp.plusMinus
      : (individualLeader?.plusMinus ?? 0);
  const individualVolatility = calculateIndividualPerHoleVolatility(rows, overallCompleted);

  let skinsHeading = "Open skins still in play";
  let skinsDetail = skins.currentCarryoverCount
    ? `${skins.currentCarryoverCount} carryover hole${skins.currentCarryoverCount === 1 ? "" : "s"} with ${rows.length ? `$${skins.totalPot}` : "$0"} in the pot`
    : "No current skins favorite";
  let skinsProbability: number | null = null;
  const completedHoles = skins.holes.length;
  const remainingSkinHoles = Math.max(0, 18 - completedHoles);

  if (skins.winners.length) {
    const favorite = skins.winners[0];
    const totalClaimedValue = skins.winners.reduce((sum, winner) => sum + winner.payout, 0);
    const currentShare = skins.totalPot > 0 ? favorite.payout / skins.totalPot : 0;
    const carryoverPressure = skins.currentCarryoverCount / Math.max(1, remainingSkinHoles + skins.currentCarryoverCount);
    const progress = completedHoles / 18;
    skinsHeading = "Most likely skins leader";
    skinsDetail = `${favorite.playerName} leads with ${favorite.skinsWon} skin share${favorite.skinsWon === 1 ? "" : "s"} (${favorite.payout > 0 ? `$${favorite.payout}` : "live"})`;
    skinsProbability = clamp(
      Math.round((currentShare * 55 + progress * 22 + (1 - carryoverPressure) * 18 + (totalClaimedValue > 0 ? 5 : 0)) * 100),
      34,
      91
    );
  }

  if (skins.currentCarryoverCount > 0) {
    skinsHeading = skins.winners.length ? "Skins favorite" : "Open skins still in play";
    skinsDetail = skins.winners.length
      ? `${skinsDetail} | ${skins.currentCarryoverCount} carryover hole${skins.currentCarryoverCount === 1 ? "" : "s"} still open`
      : `${skins.currentCarryoverCount} carryover hole${skins.currentCarryoverCount === 1 ? "" : "s"} live for ${rows.length ? `$${skins.totalPot}` : "$0"}`;
    if (!skins.winners.length) {
      skinsProbability = null;
    } else if (remainingSkinHoles > 0) {
      skinsProbability = clamp(
        Math.round((skinsProbability ?? 50) - skins.currentCarryoverCount * 4 - remainingSkinHoles * 1.5),
        30,
        85
      );
    }
  }

  return {
    frontTeam: buildTeamProjection("frontPlusMinus", "front"),
    backTeam: buildTeamProjection("backPlusMinus", "back"),
    totalTeam: buildTeamProjection("totalPlusMinus", "total"),
    individual: individualLeader
      ? {
          leaderLabel: individualLeader.playerName,
          margin: individualMargin,
          probability: estimateWinProbabilityFromState({
            margin: individualMargin,
            completed: overallCompleted,
            total: 18,
            perHoleVolatility: individualVolatility,
            competitors: Math.min(rows.length, 6)
          }),
          holesRemaining: Math.max(0, 18 - overallCompleted)
        }
      : null,
    skins: {
      heading: skinsHeading,
      detail: skinsDetail,
      probability: skinsProbability
    }
  };
}

export function calculateIndividualPayoutProjection(
  rows: CalculatedRoundRow[]
): IndividualPayoutProjection[] {
  if (!rows.length) {
    return [];
  }

  const rankedPlayers = [...rows].sort((a, b) => {
    if (b.plusMinus !== a.plusMinus) {
      return b.plusMinus - a.plusMinus;
    }
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    return a.playerName.localeCompare(b.playerName);
  });

  const { payoutByPlace } = calculateIndividualPayouts(rows);
  const overallCompleted = Math.max(...rows.map((row) => getCompletedHoleCount(row.holeScores)));
  const holesRemaining = Math.max(0, 18 - overallCompleted);
  const individualVolatility = calculateIndividualPerHoleVolatility(rows, overallCompleted);

  return payoutByPlace
    .map((spot) => {
      const projectedPlayer = rankedPlayers[spot.place - 1];

      if (!projectedPlayer) {
        return null;
      }

      const nextPlayer = rankedPlayers[spot.place] ?? null;
      const previousPlayer = rankedPlayers[spot.place - 2] ?? null;
      const marginOverNext = nextPlayer
        ? projectedPlayer.plusMinus - nextPlayer.plusMinus
        : projectedPlayer.plusMinus;
      const pressureFromAbove = previousPlayer
        ? Math.max(0, previousPlayer.plusMinus - projectedPlayer.plusMinus)
        : 0;
      const effectiveMargin = marginOverNext - pressureFromAbove * 0.35;
      const competitorCount = Math.max(2, rankedPlayers.length - spot.place + 1);

      return {
        place: spot.place,
        placeLabel:
          spot.place === 1
            ? "1st"
            : spot.place === 2
              ? "2nd"
              : spot.place === 3
                ? "3rd"
                : `${spot.place}th`,
        playerId: projectedPlayer.playerId,
        playerName: projectedPlayer.playerName,
        payout: spot.payout,
        probability: estimateWinProbabilityFromState({
          margin: effectiveMargin,
          completed: overallCompleted,
          total: 18,
          perHoleVolatility: individualVolatility,
          competitors: competitorCount
        }),
        margin: effectiveMargin,
        holesRemaining
      } satisfies IndividualPayoutProjection;
    })
    .filter((value): value is IndividualPayoutProjection => value != null);
}

export function calculatePayoutPredictions(
  rows: CalculatedRoundRow[],
  options?: {
    includeTeamPayouts?: boolean;
    includeIndividualPayouts?: boolean;
    includeSkinsPayouts?: boolean;
  }
): PayoutPredictionsSummary {
  const includeTeamPayouts = options?.includeTeamPayouts ?? true;
  const includeIndividualPayouts = options?.includeIndividualPayouts ?? true;
  const includeSkinsPayouts = options?.includeSkinsPayouts ?? true;

  const teams = calculateTeamStandings(rows);
  const sideGames = calculateSideGameResults(rows);
  const players = new Map<
    string,
    {
      playerId: string;
      playerName: string;
      front: number;
      back: number;
      total: number;
      indy: number;
      skins: number;
    }
  >();

  rows.forEach((row) => {
    players.set(row.playerId, {
      playerId: row.playerId,
      playerName: row.playerName,
      front: 0,
      back: 0,
      total: 0,
      indy: 0,
      skins: 0
    });
  });

  function applyRoundedAllocations(
    allocations: Map<string, number>,
    category: "front" | "back" | "total" | "indy" | "skins"
  ) {
    allocations.forEach((amount, playerId) => {
      const player = players.get(playerId);
      if (player) {
        player[category] = floorWholeDollar(amount);
      }
    });

    const originalTotal = roundCurrency(
      Array.from(allocations.values()).reduce((sum, amount) => sum + amount, 0)
    );
    const roundedTotal = roundCurrency(
      Array.from(players.values()).reduce((sum, player) => sum + player[category], 0)
    );

    return roundCurrency(originalTotal - roundedTotal);
  }

  const frontAllocations = includeTeamPayouts
    ? allocateTeamPotToPlayers(rows, teams, "frontPlusMinus", sideGames.teamPots.frontPot)
    : new Map<string, number>();
  const backAllocations = includeTeamPayouts
    ? allocateTeamPotToPlayers(rows, teams, "backPlusMinus", sideGames.teamPots.backPot)
    : new Map<string, number>();
  const totalAllocations = includeTeamPayouts
    ? allocateTeamPotToPlayers(rows, teams, "totalPlusMinus", sideGames.teamPots.totalPot)
    : new Map<string, number>();

  const frontBarRemainder = applyRoundedAllocations(frontAllocations, "front");
  const backBarRemainder = applyRoundedAllocations(backAllocations, "back");
  const totalBarRemainder = applyRoundedAllocations(totalAllocations, "total");

  if (includeIndividualPayouts) {
    const indyAllocations = new Map(
      sideGames.individualPayouts.map((payout) => [payout.playerId, payout.payout])
    );
    var indyBarRemainder = applyRoundedAllocations(indyAllocations, "indy");
  } else {
    var indyBarRemainder = 0;
  }

  if (includeSkinsPayouts) {
    const skinsAllocations = new Map(
      sideGames.skins.winners.map((winner) => [winner.playerId, winner.payout])
    );
    var skinsBarRemainder = applyRoundedAllocations(skinsAllocations, "skins");
  } else {
    var skinsBarRemainder = 0;
  }

  const projectedPlayers = Array.from(players.values())
    .map((player) => ({
      ...player,
      projectedTotal: roundCurrency(
        player.front + player.back + player.total + player.indy + player.skins
      )
    }))
    .sort((a, b) => {
      if (b.projectedTotal !== a.projectedTotal) {
        return b.projectedTotal - a.projectedTotal;
      }
      return a.playerName.localeCompare(b.playerName);
    });

  const frontProjectedTotal = roundCurrency(
    projectedPlayers.reduce((sum, player) => sum + player.front, 0)
  );
  const backProjectedTotal = roundCurrency(
    projectedPlayers.reduce((sum, player) => sum + player.back, 0)
  );
  const totalProjectedTotal = roundCurrency(
    projectedPlayers.reduce((sum, player) => sum + player.total, 0)
  );
  const indyProjectedTotal = roundCurrency(
    projectedPlayers.reduce((sum, player) => sum + player.indy, 0)
  );
  const skinsProjectedTotal = roundCurrency(
    projectedPlayers.reduce((sum, player) => sum + player.skins, 0)
  );
  const projectedPayoutTotal = roundCurrency(
    projectedPlayers.reduce((sum, player) => sum + player.projectedTotal, 0)
  );
  const frontPot = includeTeamPayouts ? roundCurrency(sideGames.teamPots.frontPot) : 0;
  const backPot = includeTeamPayouts ? roundCurrency(sideGames.teamPots.backPot) : 0;
  const totalPot = includeTeamPayouts ? roundCurrency(sideGames.teamPots.totalPot) : 0;
  const indyPot = includeIndividualPayouts ? roundCurrency(sideGames.overallPot.indyPot) : 0;
  const skinsPot = includeSkinsPayouts
    ? roundCurrency(sideGames.skins.winners.length ? sideGames.skins.totalPot : 0)
    : 0;
  const barRemainder = roundCurrency(
    frontBarRemainder +
      backBarRemainder +
      totalBarRemainder +
      indyBarRemainder +
      skinsBarRemainder
  );
  const moneyCurrentlyInPlay = roundCurrency(
    frontProjectedTotal +
      backProjectedTotal +
      totalProjectedTotal +
      indyProjectedTotal +
      skinsProjectedTotal +
      barRemainder
  );
  const overallPot = roundCurrency(frontPot + backPot + totalPot + indyPot + skinsPot);
  const frontDifference = roundCurrency(frontProjectedTotal + frontBarRemainder - frontPot);
  const backDifference = roundCurrency(backProjectedTotal + backBarRemainder - backPot);
  const totalDifference = roundCurrency(totalProjectedTotal + totalBarRemainder - totalPot);
  const indyDifference = roundCurrency(indyProjectedTotal + indyBarRemainder - indyPot);
  const skinsDifference = roundCurrency(skinsProjectedTotal + skinsBarRemainder - skinsPot);
  const overallDifference = roundCurrency(projectedPayoutTotal + barRemainder - overallPot);
  const unsettledSkinsValue = roundCurrency(
    Math.max(0, sideGames.skins.totalPot - skinsProjectedTotal)
  );
  const mismatchedCategories: PayoutPredictionsSummary["mismatchedCategories"] = [];

  if (!isCurrencyMatch(frontProjectedTotal, frontPot)) mismatchedCategories.push("front");
  if (!isCurrencyMatch(backProjectedTotal, backPot)) mismatchedCategories.push("back");
  if (!isCurrencyMatch(totalProjectedTotal, totalPot)) mismatchedCategories.push("total");
  if (!isCurrencyMatch(indyProjectedTotal, indyPot)) mismatchedCategories.push("indy");
  if (!isCurrencyMatch(skinsProjectedTotal, skinsPot)) mismatchedCategories.push("skins");
  if (!isCurrencyMatch(projectedPayoutTotal, overallPot)) mismatchedCategories.push("overall");

  if (mismatchedCategories.length) {
    console.warn("Payout reconciliation mismatch detected", {
      mismatchedCategories,
      frontProjectedTotal,
      frontPot,
      backProjectedTotal,
      backPot,
      totalProjectedTotal,
      totalPot,
      indyProjectedTotal,
      indyPot,
      skinsProjectedTotal,
      skinsPot,
      projectedPayoutTotal,
      overallPot
    });
  }

  return {
    players: projectedPlayers,
    frontProjectedTotal,
    backProjectedTotal,
    totalProjectedTotal,
    indyProjectedTotal,
    skinsProjectedTotal,
    frontBarRemainder,
    backBarRemainder,
    totalBarRemainder,
    indyBarRemainder,
    skinsBarRemainder,
    barRemainder,
    frontPot,
    backPot,
    totalPot,
    indyPot,
    skinsPot,
    frontDifference,
    backDifference,
    totalDifference,
    indyDifference,
    skinsDifference,
    moneyCurrentlyInPlay,
    overallPot,
    overallDifference,
    projectedPayoutTotal,
    unsettledSkinsValue,
    mismatchedCategories,
    isBalanced: mismatchedCategories.length === 0
  };
}
