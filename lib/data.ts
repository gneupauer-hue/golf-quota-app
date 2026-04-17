import { prisma } from "@/lib/prisma";
import { resolveActiveRound } from "@/lib/active-round";
import {
  calculateLiveLeaders,
  calculateLiveProjections,
  calculateSideGameResults,
  calculateTeamStandings,
  holeFieldNames,
  type RoundMode,
  type TeamCode
} from "@/lib/quota";
import { getQuotaSnapshotBeforeRound } from "@/lib/round-service";

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

export async function getPlayersForSelection() {
  return prisma.player.findMany({
    orderBy: [{ isRegular: "desc" }, { isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      quota: true,
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
      quota: player.quota,
      isRegular: player.isRegular,
      isActive: player.isActive,
      conflictIds: player.conflictsFrom.map((conflict) => conflict.conflictPlayerId)
    }))
  );
}

export async function getPlayersPageData() {
  return prisma.player.findMany({
    orderBy: [{ isRegular: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      quota: true,
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
      ...player,
      conflictIds: player.conflictsFrom.map((conflict) => conflict.conflictPlayerId)
    }))
  );
}

export async function getCurrentQuotaRows() {
  const players = await prisma.player.findMany({
    orderBy: [{ isRegular: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      quota: true,
      isRegular: true,
      isActive: true,
      roundEntries: {
        where: {
          round: {
            completedAt: {
              not: null
            }
          }
        },
        orderBy: {
          round: {
            roundDate: "desc"
          }
        },
        take: 1,
        select: {
          totalPoints: true,
          round: {
            select: {
              roundName: true,
              roundDate: true
            }
          }
        }
      }
    }
  });

  return players.map((player) => ({
    id: player.id,
    name: player.name,
    quota: player.quota,
    group: player.isRegular ? "Regular" : "Other",
    isActive: player.isActive,
    lastRoundPlayed: player.roundEntries[0]?.round.roundName ?? "-",
    lastRoundDate: player.roundEntries[0]?.round.roundDate ?? null,
    lastScore: player.roundEntries[0]?.totalPoints ?? null
  }));
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
    orderBy: [{ roundDate: "desc" }, { createdAt: "desc" }]
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
    orderBy: [{ roundDate: "desc" }, { createdAt: "desc" }]
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
  const activeRound = await resolveActiveRound(prisma);
  return activeRound?.id ?? null;
}

async function getLeaderboardRoundId() {
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

export async function getRoundResultsData(roundId: string) {
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
    money: calculateSideGameResults(entries)
  };
}

export async function getHomePageData() {
  const [playersCount, activeCount, roundCount, latestRound, activeRound] = await Promise.all([
    prisma.player.count(),
    prisma.player.count({ where: { isActive: true } }),
    prisma.round.count(),
    prisma.round.findFirst({
      orderBy: [{ roundDate: "desc" }, { createdAt: "desc" }],
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
