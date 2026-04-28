import { prisma } from "@/lib/prisma";
import { resolveActiveRound } from "@/lib/active-round";
import { unstable_noStore as noStore } from "next/cache";
import {
  calculateLiveLeaders,
  calculateLiveProjections,
  calculatePayoutPredictions,
  calculatePlayerBuyIns,
  calculateSideGameResults,
  calculateTeamStandings,
  holeFieldNames,
  type RoundMode,
  type TeamCode
} from "@/lib/quota";
import { getQuotaSnapshotBeforeRound } from "@/lib/round-service";
import { getSeasonConfig, getSeasonStartDate } from "@/lib/season";
import type { SideMatchRecord } from "@/lib/side-matches";
import { formatDisplayDate } from "@/lib/utils";
import { baseline_quotas_2026, requireBaselineQuota2026 } from "@/lib/baseline-quotas-2026";
import { rebuildPlayerQuotaHistory, validateAllPlayerQuotas, validatePlayerQuotaHistory, type QuotaValidationSummary } from "@/lib/quota-history";

function normalizeRoundMode(value: string): RoundMode {
  return value === "SKINS_ONLY" ? "SKINS_ONLY" : "MATCH_QUOTA";
}

function getRoundSettlementState(round: unknown) {
  const settlementRound = round as {
    isPayoutLocked?: boolean;
    paidPlayerIds?: string[];
    buyInPaidPlayerIds?: string[];
  };

  return {
    isPayoutLocked: settlementRound.isPayoutLocked ?? false,
    paidPlayerIds: settlementRound.paidPlayerIds ?? [],
    buyInPaidPlayerIds: settlementRound.buyInPaidPlayerIds ?? []
  };
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type SeasonStatsSort = "net" | "improved" | "rounds" | "quota";

export async function getPlayersForSelection() {
  return prisma.player.findMany({
    orderBy: [{ isRegular: "desc" }, { isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      quota: true,
      currentQuota: true,
      startingQuota: true,
      isRegular: true,
      isActive: true,
      conflictsFrom: {
        select: {
          conflictPlayerId: true
        }
      }
    }
  }).then((players) =>
    players.map((player) => ({
      id: player.id,
      name: player.name,
      quota: player.currentQuota ?? player.quota ?? player.startingQuota,
      isRegular: player.isRegular,
      isActive: player.isActive,
      conflictIds: player.conflictsFrom.map((conflict) => conflict.conflictPlayerId)
    }))
  );
}

export async function getPlayersPageData() {
  const seasonStartDate = await getSeasonStartDate(prisma);

  const players = await prisma.player.findMany({
    orderBy: [{ isRegular: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      quota: true,
      currentQuota: true,
      startingQuota: true,
      isRegular: true,
      isActive: true,
      conflictsFrom: {
        select: {
          conflictPlayerId: true
        }
      },
      roundEntries: {
        where: {
          round: {
            completedAt: {
              not: null,
              gte: seasonStartDate
            },
            canceledAt: null
          }
        },
        orderBy: [
          {
            round: {
              completedAt: "desc"
            }
          },
          {
            round: {
              roundDate: "desc"
            }
          },
          {
            round: {
              createdAt: "desc"
            }
          }
        ],
        select: {
          totalPoints: true,
          startQuota: true,
          plusMinus: true,
          nextQuota: true,
          round: {
            select: {
              id: true,
              roundName: true,
              roundDate: true,
              completedAt: true,
              createdAt: true
            }
          }
        }
      }
    }
  });

  const validationInputs = players.map((player) => ({
    playerId: player.id,
    playerName: player.name,
    baselineQuota: requireBaselineQuota2026(player.name),
    currentQuota: player.currentQuota ?? player.quota ?? player.startingQuota,
    rounds: player.roundEntries.map((entry) => ({
      roundId: entry.round.id,
      roundName: entry.round.roundName,
      roundDate: entry.round.roundDate,
      completedAt: entry.round.completedAt,
      createdAt: entry.round.createdAt,
      totalPoints: entry.totalPoints,
      startQuota: entry.startQuota,
      plusMinus: entry.plusMinus,
      nextQuota: entry.nextQuota
    }))
  }));

  const quotaAudit = validateAllPlayerQuotas(validationInputs);
  const rebuiltByPlayerId = new Map(
    validationInputs.map((player) => [player.playerId, validatePlayerQuotaHistory(player).rebuilt])
  );

  return {
    players: players.map((player) => {
      const rebuiltHistory = rebuiltByPlayerId.get(player.id)!;

      return {
        id: player.id,
        name: player.name,
        quota: rebuiltHistory.currentQuota,
        isRegular: player.isRegular,
        isActive: player.isActive,
        conflictIds: player.conflictsFrom.map((conflict) => conflict.conflictPlayerId),
        history: rebuiltHistory.roundsDescending
      };
    }),
    quotaAudit,
    baselineRows: await getBaselineQuotaRows()
  };
}

export async function getCurrentQuotaRows() {
  const seasonStartDate = await getSeasonStartDate(prisma);

  const players = await prisma.player.findMany({
    orderBy: [{ isRegular: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      quota: true,
      currentQuota: true,
      startingQuota: true,
      isRegular: true,
      isActive: true,
      roundEntries: {
        where: {
          round: {
            completedAt: {
              not: null,
              gte: seasonStartDate
            },
            canceledAt: null
          }
        },
        orderBy: {
          round: {
            completedAt: "desc"
          }
        },
        select: {
          totalPoints: true,
          startQuota: true,
          plusMinus: true,
          nextQuota: true,
          round: {
            select: {
              id: true,
              roundName: true,
              completedAt: true,
              roundDate: true,
              createdAt: true
            }
          }
        }
      }
    }
  });

  return players
    .map((player) => {
      const baselineQuota = requireBaselineQuota2026(player.name);
      const validation = validatePlayerQuotaHistory({
        playerId: player.id,
        playerName: player.name,
        baselineQuota,
        currentQuota: player.currentQuota ?? player.quota ?? player.startingQuota,
        rounds: player.roundEntries.map((entry) => ({
          roundId: entry.round.id,
          roundName: entry.round.roundName,
          roundDate: entry.round.roundDate,
          completedAt: entry.round.completedAt,
          createdAt: entry.round.createdAt,
          totalPoints: entry.totalPoints,
          startQuota: entry.startQuota,
          plusMinus: entry.plusMinus,
          nextQuota: entry.nextQuota
        }))
      });
      const rebuiltHistory = validation.rebuilt;
      const latestRound = rebuiltHistory.latestRound;
      const latestRoundDate = latestRound?.completedAt ?? latestRound?.roundDate ?? null;
      const persistedCurrentQuota = player.currentQuota ?? player.quota ?? player.startingQuota;

      return {
        id: player.id,
        name: player.name,
        quota: rebuiltHistory.currentQuota,
        group: player.isRegular ? "Regular" : "Other",
        isActive: player.isActive,
        baselineQuota,
        persistedCurrentQuota,
        mismatchCount: validation.issues.length,
        auditIssues: validation.issues.map((issue) => ({
          roundLabel: issue.roundLabel,
          fieldLabel: issue.fieldLabel,
          expected: issue.expected,
          actual: issue.actual
        })),
        history: rebuiltHistory.roundsDescending,
        lastRoundPlayed: latestRoundDate ? formatDisplayDate(latestRoundDate) : "-",
        lastRoundDate: latestRoundDate,
        lastScore: latestRound?.totalPoints ?? null
      };
    })
    .sort((left, right) => {
      const leftHasPlayed = Boolean(left.lastRoundDate);
      const rightHasPlayed = Boolean(right.lastRoundDate);

      if (leftHasPlayed !== rightHasPlayed) {
        return leftHasPlayed ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });
}

export async function getSeasonStatsData(sortBy: SeasonStatsSort = "net") {
  const seasonConfig = await getSeasonConfig(prisma);
  const seasonStartDate = seasonConfig.seasonStartDate;

  const [players, rounds] = await Promise.all([
    prisma.player.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        quota: true,
        currentQuota: true,
        startingQuota: true,
        isRegular: true,
        isActive: true
      }
    }),
    (prisma as any).round.findMany({
      where: {
        completedAt: {
          not: null,
          gt: seasonStartDate
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
    })
  ]);

  const statsByPlayer = new Map(
    players.map((player) => [
      player.id,
      {
        playerId: player.id,
        playerName: player.name,
        isRegular: player.isRegular,
        isActive: player.isActive,
        roundsPlayed: 0,
        currentQuota: player.currentQuota ?? player.quota ?? player.startingQuota,
        startingQuota: null as number | null,
        quotaChange: 0,
        totalPaidIn: 0,
        totalPaidOut: 0,
        netWinnings: 0,
        totalSkinsWinnings: 0,
        totalIndyWinnings: 0,
        totalFrontWinnings: 0,
        totalBackWinnings: 0,
        totalTotalMatchWinnings: 0,
        skinsCount: 0,
        indyCashes: 0,
        indyWins: 0,
        teamWins: 0
      }
    ])
  );

  for (const round of rounds as any[]) {
    const roundMode = normalizeRoundMode(round.roundMode);
    const entries = (round.entries as any[]).map((entry: any) => ({
      id: entry.id,
      playerId: entry.playerId,
      playerName: entry.player.name,
      team: (entry.team as TeamCode | null) ?? null,
      holeScores: holeFieldNames.map((fieldName) => entry[fieldName]),
      startQuota: entry.startQuota,
      frontQuota: entry.frontQuota,
      backQuota: entry.backQuota,
      frontNine: entry.frontNine,
      backNine: entry.backNine,
      frontPlusMinus: entry.frontPlusMinus,
      backPlusMinus: entry.backPlusMinus,
      totalPoints: entry.totalPoints,
      plusMinus: entry.plusMinus,
      nextQuota: entry.nextQuota,
      rank: entry.rank
    }));

    const buyIns = calculatePlayerBuyIns(entries, roundMode);
    const buyInMap = new Map(buyIns.players.map((player) => [player.playerId, player]));
    const payouts = calculatePayoutPredictions(entries, {
      includeTeamPayouts: roundMode !== "SKINS_ONLY",
      includeIndividualPayouts: roundMode !== "SKINS_ONLY",
      includeSkinsPayouts: true
    });
    const payoutMap = new Map(payouts.players.map((player) => [player.playerId, player]));
    const sideGames = calculateSideGameResults(entries);
    const skinsWinnerMap = new Map(
      sideGames.skins.winners.map((winner) => [winner.playerId, winner.skinsWon])
    );
    const indyCashSet = new Set(
      sideGames.individualPayouts.filter((entry) => entry.payout > 0).map((entry) => entry.playerId)
    );
    const indyWinSet = new Set(
      sideGames.individualPayouts
        .filter((entry) => entry.payout > 0 && entry.rank === 1)
        .map((entry) => entry.playerId)
    );

    for (const entry of entries) {
      const stats = statsByPlayer.get(entry.playerId);
      if (!stats) {
        continue;
      }

      if (stats.startingQuota == null) {
        stats.startingQuota = entry.startQuota;
      }

      stats.roundsPlayed += 1;

      const buyIn = buyInMap.get(entry.playerId);
      const payout = payoutMap.get(entry.playerId);

      stats.totalPaidIn += buyIn?.totalOwed ?? 0;
      stats.totalFrontWinnings += payout?.front ?? 0;
      stats.totalBackWinnings += payout?.back ?? 0;
      stats.totalTotalMatchWinnings += payout?.total ?? 0;
      stats.totalIndyWinnings += payout?.indy ?? 0;
      stats.totalSkinsWinnings += payout?.skins ?? 0;
      stats.totalPaidOut += payout?.projectedTotal ?? 0;
      stats.skinsCount += skinsWinnerMap.get(entry.playerId) ?? 0;
      stats.indyCashes += indyCashSet.has(entry.playerId) ? 1 : 0;
      stats.indyWins += indyWinSet.has(entry.playerId) ? 1 : 0;
      stats.teamWins += Number((payout?.front ?? 0) > 0);
      stats.teamWins += Number((payout?.back ?? 0) > 0);
      stats.teamWins += Number((payout?.total ?? 0) > 0);
    }
  }

  const playerStats = Array.from(statsByPlayer.values()).map((stats) => {
    const startingQuota = stats.startingQuota ?? stats.currentQuota;
    const totalPaidIn = roundCurrency(stats.totalPaidIn);
    const totalPaidOut = roundCurrency(stats.totalPaidOut);
    const totalSkinsWinnings = roundCurrency(stats.totalSkinsWinnings);
    const totalIndyWinnings = roundCurrency(stats.totalIndyWinnings);
    const totalFrontWinnings = roundCurrency(stats.totalFrontWinnings);
    const totalBackWinnings = roundCurrency(stats.totalBackWinnings);
    const totalTotalMatchWinnings = roundCurrency(stats.totalTotalMatchWinnings);
    const netWinnings = roundCurrency(totalPaidOut - totalPaidIn);
    const quotaChange = startingQuota - stats.currentQuota;

    return {
      ...stats,
      startingQuota,
      quotaChange,
      totalPaidIn,
      totalPaidOut,
      netWinnings,
      totalSkinsWinnings,
      totalIndyWinnings,
      totalFrontWinnings,
      totalBackWinnings,
      totalTotalMatchWinnings
    };
  });

  const compareByName = (left: { playerName: string }, right: { playerName: string }) =>
    left.playerName.localeCompare(right.playerName);

  const sortedStats = [...playerStats].sort((left, right) => {
    if (sortBy === "improved") {
      if (right.quotaChange !== left.quotaChange) return right.quotaChange - left.quotaChange;
      if (right.netWinnings !== left.netWinnings) return right.netWinnings - left.netWinnings;
      return compareByName(left, right);
    }

    if (sortBy === "rounds") {
      if (right.roundsPlayed !== left.roundsPlayed) return right.roundsPlayed - left.roundsPlayed;
      if (right.netWinnings !== left.netWinnings) return right.netWinnings - left.netWinnings;
      return compareByName(left, right);
    }

    if (sortBy === "quota") {
      if (left.currentQuota !== right.currentQuota) return left.currentQuota - right.currentQuota;
      if (right.quotaChange !== left.quotaChange) return right.quotaChange - left.quotaChange;
      return compareByName(left, right);
    }

    if (right.netWinnings !== left.netWinnings) return right.netWinnings - left.netWinnings;
    if (right.totalPaidOut !== left.totalPaidOut) return right.totalPaidOut - left.totalPaidOut;
    return compareByName(left, right);
  });

  const playersWithRounds = playerStats.filter((player) => player.roundsPlayed > 0);
  const pickLeader = <T,>(items: T[], compare: (left: T, right: T) => number) =>
    [...items].sort(compare)[0] ?? null;

  return {
    seasonStartDate: seasonConfig.seasonStartDate,
    sortBy,
    summary: {
      moneyLeader: pickLeader(playersWithRounds, (left, right) => {
        const value =
          right.netWinnings - left.netWinnings ||
          right.totalPaidOut - left.totalPaidOut ||
          compareByName(left as { playerName: string }, right as { playerName: string });
        return value;
      }),
      mostImproved: pickLeader(playersWithRounds, (left, right) => {
        const value =
          right.quotaChange - left.quotaChange ||
          right.netWinnings - left.netWinnings ||
          compareByName(left as { playerName: string }, right as { playerName: string });
        return value;
      }),
      skinsLeader: pickLeader(playersWithRounds, (left, right) => {
        const value =
          right.totalSkinsWinnings - left.totalSkinsWinnings ||
          right.skinsCount - left.skinsCount ||
          compareByName(left as { playerName: string }, right as { playerName: string });
        return value;
      }),
      mostRoundsPlayed: pickLeader(playersWithRounds, (left, right) => {
        const value =
          right.roundsPlayed - left.roundsPlayed ||
          right.netWinnings - left.netWinnings ||
          compareByName(left as { playerName: string }, right as { playerName: string });
        return value;
      })
    },
    players: sortedStats
  };
}

export async function getRoundsList() {
  const rounds = await (prisma as any).round.findMany({
    where: {
      canceledAt: null
    },
    include: {
      entries: {
        include: {
          player: {
            select: {
              name: true
            }
          }
        },
        orderBy: {
          rank: "asc"
        }
      }
    },
    orderBy: [{ completedAt: "desc" }, { roundDate: "desc" }, { createdAt: "desc" }]
  });

  return (rounds as any[]).map((round: any) => {
    const settlement = getRoundSettlementState(round);

    return {
      id: round.id,
      roundName: round.roundName,
      roundDate: round.roundDate,
      roundMode: normalizeRoundMode(round.roundMode),
      isTestRound: round.isTestRound,
      isPayoutLocked: settlement.isPayoutLocked,
      notes: round.notes,
      teamCount: round.teamCount,
      lockedAt: round.lockedAt,
      startedAt: round.startedAt,
      completedAt: round.completedAt,
      entryCount: round.entries.length,
      leader: round.entries[0]
        ? {
            name: round.entries[0].player.name,
            plusMinus: round.entries[0].plusMinus
          }
        : null
    };
  });
}

export async function getPastGamesList() {
  const rounds = await (prisma as any).round.findMany({
    where: {
      completedAt: {
        not: null
      },
      canceledAt: null
    },
    include: {
      entries: {
        include: {
          player: {
            select: {
              name: true
            }
          }
        },
        orderBy: {
          rank: "asc"
        }
      }
    },
    orderBy: [{ completedAt: "desc" }, { roundDate: "desc" }, { createdAt: "desc" }]
  });

  return (rounds as any[]).map((round: any) => {
    const settlement = getRoundSettlementState(round);

    return {
      id: round.id,
      roundName: round.roundName,
      roundDate: round.roundDate,
      roundMode: normalizeRoundMode(round.roundMode),
      isTestRound: round.isTestRound,
      isPayoutLocked: settlement.isPayoutLocked,
      notes: round.notes,
      teamCount: round.teamCount,
      lockedAt: round.lockedAt,
      startedAt: round.startedAt,
      completedAt: round.completedAt,
      entryCount: round.entries.length,
      leader: round.entries[0]
        ? {
            name: round.entries[0].player.name,
            plusMinus: round.entries[0].plusMinus
          }
        : null
    };
  });
}

export async function getCurrentRoundId() {
  noStore();
  const activeRound = await resolveActiveRound(prisma);
  return activeRound?.id ?? null;
}

async function getLeaderboardRoundId() {
  noStore();
  const activeRound = await resolveActiveRound(prisma);
  return activeRound?.id ?? null;
}

export async function getLeaderboardPageData() {
  const currentRoundId = await getLeaderboardRoundId();

  if (!currentRoundId) {
    return null;
  }

  const data = await getRoundEditorData(currentRoundId);
  if (!data) {
    return null;
  }

  const calculatedEntries = data.round.entries.map((entry: any) => ({
    playerId: entry.playerId,
    playerName: entry.playerName,
    team: entry.team,
    holeScores: entry.holeScores,
    startQuota: entry.startQuota,
    frontQuota: entry.frontQuota,
    backQuota: entry.backQuota,
    frontNine: entry.frontNine,
    backNine: entry.backNine,
    frontPlusMinus: entry.frontPlusMinus,
    backPlusMinus: entry.backPlusMinus,
    totalPoints: entry.totalPoints,
    plusMinus: entry.plusMinus,
    nextQuota: entry.nextQuota,
    rank: entry.rank
  }));

  const teamStandings = calculateTeamStandings(calculatedEntries);
  const leaders = calculateLiveLeaders(calculatedEntries);
  const projections = calculateLiveProjections(calculatedEntries);
  const money = calculateSideGameResults(calculatedEntries);

  console.info("[scoreboard] getLeaderboardPageData", {
    round: {
      id: data.round.id,
      roundName: data.round.roundName,
      roundMode: data.round.roundMode,
      completedAt: data.round.completedAt
    },
    teams: teamStandings,
    playerScores: calculatedEntries.map((entry) => ({
      playerId: entry.playerId,
      playerName: entry.playerName,
      team: entry.team,
      frontNine: entry.frontNine,
      backNine: entry.backNine,
      totalPoints: entry.totalPoints,
      plusMinus: entry.plusMinus,
      rank: entry.rank
    }))
  });

  return {
    round: data.round,
    entries: calculatedEntries,
    leaders,
    projections,
    teamStandings,
    money
  };
}

export async function getRoundEditorData(roundId: string) {
  noStore();
  const [round, players] = await Promise.all([
    (prisma as any).round.findUnique({
      where: { id: roundId },
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
      }
    }),
    getPlayersForSelection()
  ]);

  if (!round) {
    return null;
  }

  const quotaSnapshot = await getQuotaSnapshotBeforeRound(prisma, roundId);

  const calculatedEntries = (round.entries as any[]).map((entry: any) => ({
      id: entry.id,
      playerId: entry.playerId,
      playerName: entry.player.name,
      team: (entry.team as TeamCode | null) ?? null,
      groupNumber: entry.groupNumber,
      teeTime: entry.teeTime,
      frontSubmittedAt: entry.frontSubmittedAt?.toISOString() ?? null,
      backSubmittedAt: entry.backSubmittedAt?.toISOString() ?? null,
      holeScores: holeFieldNames.map((fieldName) => entry[fieldName]),
    frontQuota: entry.frontQuota,
    backQuota: entry.backQuota,
    frontNine: entry.frontNine,
    backNine: entry.backNine,
    frontPlusMinus: entry.frontPlusMinus,
    backPlusMinus: entry.backPlusMinus,
    totalPoints: entry.totalPoints,
    startQuota: entry.startQuota,
    plusMinus: entry.plusMinus,
    nextQuota: entry.nextQuota,
    rank: entry.rank
  }));

  const teamStandings = calculateTeamStandings(calculatedEntries);
  const liveLeaders = calculateLiveLeaders(calculatedEntries);

  console.info("[live-round] fetched-round-editor-data", {
    roundId,
    completedAt: round.completedAt,
    lockedAt: round.lockedAt,
    startedAt: round.startedAt,
    entries: calculatedEntries.map((entry: any) => ({
      playerId: entry.playerId,
      team: entry.team,
      completedHoles: entry.holeScores.filter((score: number | null) => score != null).length,
      nextHole:
        Math.min(
          entry.holeScores.findIndex((score: number | null) => score == null) + 1 || 19,
          18
        ),
      frontSubmittedAt: entry.frontSubmittedAt,
      backSubmittedAt: entry.backSubmittedAt
    }))
  });

  const settlement = getRoundSettlementState(round);

  return {
    round: {
      id: round.id,
      roundName: round.roundName,
      roundDate: round.roundDate.toISOString(),
      roundMode: normalizeRoundMode(round.roundMode),
      isTestRound: round.isTestRound,
      isPayoutLocked: settlement.isPayoutLocked,
      buyInPaidPlayerIds: settlement.buyInPaidPlayerIds,
      paidPlayerIds: settlement.paidPlayerIds,
      notes: round.notes ?? "",
      teamCount: round.teamCount ?? null,
      lockedAt: round.lockedAt?.toISOString() ?? null,
      startedAt: round.startedAt?.toISOString() ?? null,
      completedAt: round.completedAt?.toISOString() ?? null,
      canceledAt: round.canceledAt?.toISOString() ?? null,
      entries: calculatedEntries
    },
    players,
    quotaSnapshot,
    teamStandings,
    liveLeaders,
    groups: Array.from(
      calculatedEntries
      .filter((entry) => entry.groupNumber && entry.teeTime)
      .reduce(
        (
          acc: Map<string, { groupNumber: number; teeTime: string; players: string[] }>,
          entry: any
        ) => {
          const key = `${entry.groupNumber}`;
          const current = acc.get(key) ?? {
            groupNumber: entry.groupNumber!,
            teeTime: entry.teeTime!,
            players: [] as string[]
          };
          current.players.push(entry.playerName);
          acc.set(key, current);
          return acc;
        },
        new Map<string, { groupNumber: number; teeTime: string; players: string[] }>()
      )
      .values()
    )
  };
}

export async function getActiveSideMatchesData() {
  noStore();
  const roundId = await getCurrentRoundId();

  if (!roundId) {
    return null;
  }

  const data = await getRoundEditorData(roundId);

  if (!data || (!data.round.startedAt && !data.round.lockedAt) || data.round.completedAt || data.round.canceledAt) {
    return null;
  }

  const sideMatches = await ((prisma as any).roundSideMatch?.findMany({
    where: {
      roundId
    },
    orderBy: {
      createdAt: "asc"
    }
  }) ?? Promise.resolve([]));

  return {
    round: {
      id: data.round.id,
      roundName: data.round.roundName,
      roundDate: data.round.roundDate,
      roundMode: data.round.roundMode
    },
    entries: data.round.entries,
    sideMatches: (sideMatches as any[]).map(
      (match): SideMatchRecord => ({
        id: match.id,
        roundId: match.roundId,
        name: match.name ?? null,
        teamAPlayerIds: match.teamAPlayerIds ?? [],
        teamBPlayerIds: match.teamBPlayerIds ?? [],
        createdAt:
          match.createdAt instanceof Date ? match.createdAt.toISOString() : String(match.createdAt)
      })
    )
  };
}

export async function getArchivedSideMatchesData() {
  noStore();
  const rounds = await (prisma as any).round.findMany({
    where: {
      completedAt: {
        not: null
      },
      canceledAt: null,
      sideMatches: {
        some: {}
      }
    },
    include: {
      entries: {
        include: {
          player: {
            select: {
              name: true
            }
          }
        },
        orderBy: {
          rank: "asc"
        }
      },
      sideMatches: {
        orderBy: {
          createdAt: "asc"
        }
      }
    },
    orderBy: [{ completedAt: "desc" }, { roundDate: "desc" }, { createdAt: "desc" }]
  });

  return (rounds as any[]).map((round) => ({
    round: {
      id: round.id,
      roundName: round.roundName,
      roundDate: round.roundDate.toISOString(),
      completedAt: round.completedAt?.toISOString() ?? null
    },
    entries: round.entries.map((entry: any) => ({
      id: entry.id,
      playerId: entry.playerId,
      playerName: entry.player.name,
      team: (entry.team as TeamCode | null) ?? null,
      holeScores: holeFieldNames.map((fieldName) => entry[fieldName]),
      frontQuota: entry.frontQuota,
      backQuota: entry.backQuota,
      frontNine: entry.frontNine,
      backNine: entry.backNine,
      frontPlusMinus: entry.frontPlusMinus,
      backPlusMinus: entry.backPlusMinus,
      totalPoints: entry.totalPoints,
      startQuota: entry.startQuota,
      plusMinus: entry.plusMinus,
      nextQuota: entry.nextQuota,
      rank: entry.rank
    })),
    sideMatches: round.sideMatches.map(
      (match: any): SideMatchRecord => ({
        id: match.id,
        roundId: match.roundId,
        name: match.name ?? null,
        teamAPlayerIds: match.teamAPlayerIds ?? [],
        teamBPlayerIds: match.teamBPlayerIds ?? [],
        createdAt:
          match.createdAt instanceof Date ? match.createdAt.toISOString() : String(match.createdAt)
      })
    )
  }));
}

export async function getRoundResultsData(roundId: string) {
  const seasonStartDate = await getSeasonStartDate(prisma);

  const round = await (prisma as any).round.findUnique({
    where: { id: roundId },
    include: {
      entries: {
        include: {
          player: {
            select: {
              name: true
            }
          }
        },
        orderBy: {
          rank: "asc"
        }
      }
    }
  });

  if (!round) {
    return null;
  }

  const entries = (round.entries as any[]).map((entry: any) => ({
    id: entry.id,
    playerId: entry.playerId,
    playerName: entry.player.name,
    team: (entry.team as TeamCode | null) ?? null,
    groupNumber: entry.groupNumber,
    teeTime: entry.teeTime,
    holeScores: holeFieldNames.map((fieldName) => entry[fieldName]),
    frontQuota: entry.frontQuota,
    backQuota: entry.backQuota,
    frontNine: entry.frontNine,
    backNine: entry.backNine,
    frontPlusMinus: entry.frontPlusMinus,
    backPlusMinus: entry.backPlusMinus,
    totalPoints: entry.totalPoints,
    startQuota: entry.startQuota,
    plusMinus: entry.plusMinus,
    nextQuota: entry.nextQuota,
    rank: entry.rank
  }));

  const quotaAuditPlayers = await prisma.player.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      quota: true,
      currentQuota: true,
      startingQuota: true,
      roundEntries: {
        where: {
          round: {
            completedAt: {
              not: null,
              gte: seasonStartDate
            },
            canceledAt: null
          }
        },
        orderBy: [
          {
            round: {
              completedAt: "asc"
            }
          },
          {
            round: {
              roundDate: "asc"
            }
          },
          {
            round: {
              createdAt: "asc"
            }
          }
        ],
        select: {
          totalPoints: true,
          startQuota: true,
          plusMinus: true,
          nextQuota: true,
          round: {
            select: {
              id: true,
              roundName: true,
              roundDate: true,
              completedAt: true,
              createdAt: true
            }
          }
        }
      }
    }
  });

  const quotaAudit = validateAllPlayerQuotas(
    quotaAuditPlayers.map((player) => ({
      playerId: player.id,
      playerName: player.name,
      baselineQuota: requireBaselineQuota2026(player.name),
      currentQuota: player.currentQuota ?? player.quota ?? player.startingQuota,
      rounds: player.roundEntries.map((entry) => ({
        roundId: entry.round.id,
        roundName: entry.round.roundName,
        roundDate: entry.round.roundDate,
        completedAt: entry.round.completedAt,
        createdAt: entry.round.createdAt,
        totalPoints: entry.totalPoints,
        startQuota: entry.startQuota,
        plusMinus: entry.plusMinus,
        nextQuota: entry.nextQuota
      }))
    }))
  );

  const settlement = getRoundSettlementState(round);
  console.info("[scoreboard] getRoundResultsData", {
    roundId,
    roundName: round.roundName,
    completedAt: round.completedAt,
    entryCount: entries.length,
    teamCount: calculateTeamStandings(entries).length,
    playerScores: entries.map((entry) => ({
      playerId: entry.playerId,
      playerName: entry.playerName,
      team: entry.team,
      totalPoints: entry.totalPoints,
      plusMinus: entry.plusMinus
    }))
  });

  return {
    round: {
      id: round.id,
      roundName: round.roundName,
      roundDate: round.roundDate,
      roundMode: normalizeRoundMode(round.roundMode),
      isTestRound: round.isTestRound,
      isPayoutLocked: settlement.isPayoutLocked,
      buyInPaidPlayerIds: settlement.buyInPaidPlayerIds,
      paidPlayerIds: settlement.paidPlayerIds,
      notes: round.notes,
      completedAt: round.completedAt
    },
    entries,
    teamStandings: calculateTeamStandings(entries),
    leaders: calculateLiveLeaders(entries),
    money: calculateSideGameResults(entries),
    quotaAudit
  };
}

export async function getHomePageData() {
  const [playersCount, activeCount, roundCount, latestRound, activeRound] = await Promise.all([
    prisma.player.count(),
    prisma.player.count({ where: { isActive: true } }),
    prisma.round.count(),
    prisma.round.findFirst({
      orderBy: [{ completedAt: "desc" }, { roundDate: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        roundName: true,
        roundDate: true,
        completedAt: true
      }
    }),
    resolveActiveRound(prisma)
  ]);

  const currentRound = activeRound
    ? await prisma.round.findUnique({
        where: { id: activeRound.id },
        select: {
          id: true,
          roundName: true,
          roundDate: true,
          teamCount: true,
          startedAt: true
        }
      })
    : null;

  return {
    playersCount,
    activeCount,
    roundCount,
    latestRound,
    currentRound
  };
}







export async function getBaselineQuotaRows() {
  return baseline_quotas_2026
    .map((entry) => ({
      playerName: entry.player_name,
      baselineQuota: entry.baseline_quota
    }))
    .sort((left, right) => left.playerName.localeCompare(right.playerName));
}