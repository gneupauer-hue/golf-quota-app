import type { Prisma, PrismaClient } from "@prisma/client";
import {
  calculateSideGameResults,
  calculateRoundRows,
  calculateTotals,
  calculateTeamStandings,
  hasSequentialHoleEntry,
  holeFieldNames,
  isRoundRowComplete,
  type RoundMode,
  type TeamCode
} from "@/lib/quota";
import { formatRoundNameFromDate } from "@/lib/utils";

type Tx = Prisma.TransactionClient | PrismaClient;
type HoleFieldName = (typeof holeFieldNames)[number];

type HoleEntryPayload = {
  playerId: string;
  team: TeamCode | null;
  groupNumber?: number | null;
  teeTime?: string | null;
  frontSubmittedAt?: Date | null;
  backSubmittedAt?: Date | null;
  holes: Array<number | null>;
};

function getHoleScores(entry: Record<HoleFieldName, number | null>) {
  return holeFieldNames.map((fieldName) => entry[fieldName]);
}

function buildHoleFields(holes: Array<number | null>) {
  return Object.fromEntries(
    holeFieldNames.map((fieldName, index) => [fieldName, holes[index] ?? null])
  ) as Record<HoleFieldName, number | null>;
}

async function persistRoundSummaries(
  tx: Tx,
  roundId: string,
  rows: ReturnType<typeof calculateRoundRows>
) {
  const teamStandings = calculateTeamStandings(rows);
  const sideGames = calculateSideGameResults(rows);

  await tx.roundTeamResult.deleteMany({
    where: { roundId }
  });

  if (teamStandings.length) {
    await tx.roundTeamResult.createMany({
      data: teamStandings.map((team) => ({
        roundId,
        team: team.team,
        playerCount: team.players.length,
        frontPoints: team.frontPoints,
        frontQuota: team.frontQuota,
        frontPlusMinus: team.frontPlusMinus,
        backPoints: team.backPoints,
        backQuota: team.backQuota,
        backPlusMinus: team.backPlusMinus,
        totalPoints: team.totalPoints,
        totalQuota: team.totalQuota,
        totalPlusMinus: team.totalPlusMinus
      }))
    });
  }

  await tx.roundSkinHole.deleteMany({
    where: { roundId }
  });

  if (sideGames.skins.holes.length) {
    await tx.roundSkinHole.createMany({
      data: sideGames.skins.holes.map((hole) => ({
        roundId,
        holeNumber: hole.holeNumber,
        eligiblePlayerIds: hole.eligiblePlayerIds.join(","),
        eligibleNames: hole.eligibleNames.join(", "),
        carryover: hole.carryover,
        skinAwarded: hole.skinAwarded,
        winnerPlayerId: hole.winnerPlayerId,
        winnerName: hole.winnerName,
        sharesCaptured: hole.sharesCaptured,
        activeCarryover: hole.activeCarryover
      }))
    });
  }

  await tx.roundPayoutSummary.upsert({
    where: { roundId },
    create: {
      roundId,
      frontPot: sideGames.teamPots.frontPot,
      backPot: sideGames.teamPots.backPot,
      totalPot: sideGames.teamPots.totalPot,
      skinsPot: sideGames.skins.totalPot,
      leaderCount: sideGames.cashers.length,
      payoutCount: sideGames.cashers.length,
      casherCount: sideGames.cashers.length,
      totalSkinSharesWon: sideGames.skins.totalSkinSharesWon,
      valuePerSkin: sideGames.skins.valuePerSkin,
      activeCarryoverCount: sideGames.skins.currentCarryoverCount,
      activeCarryoverHoles: sideGames.skins.currentCarryoverHoles.join(",")
    },
    update: {
      frontPot: sideGames.teamPots.frontPot,
      backPot: sideGames.teamPots.backPot,
      totalPot: sideGames.teamPots.totalPot,
      skinsPot: sideGames.skins.totalPot,
      leaderCount: sideGames.cashers.length,
      payoutCount: sideGames.cashers.length,
      casherCount: sideGames.cashers.length,
      totalSkinSharesWon: sideGames.skins.totalSkinSharesWon,
      valuePerSkin: sideGames.skins.valuePerSkin,
      activeCarryoverCount: sideGames.skins.currentCarryoverCount,
      activeCarryoverHoles: sideGames.skins.currentCarryoverHoles.join(",")
    }
  });
}

export function shouldSkipQuotaProgression(round: {
  roundMode: string;
  isTestRound?: boolean | null;
}) {
  return round.roundMode === "SKINS_ONLY" || Boolean(round.isTestRound);
}

function resolveHistoricalStartQuota(
  priorQuota: number | undefined,
  storedStartQuota: number | null | undefined,
  baseQuota: number | undefined
) {
  if (priorQuota != null) {
    return priorQuota;
  }

  if (baseQuota != null) {
    return baseQuota;
  }

  if (storedStartQuota != null && storedStartQuota > 0) {
    return storedStartQuota;
  }

  return 0;
}

async function syncRoundComputedState(tx: Tx, roundId: string) {
  const round = await tx.round.findUnique({
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
          playerId: "asc"
        }
      }
    }
  });

  if (!round) {
    throw new Error("Round not found");
  }

  const quotaMap = await getQuotaSnapshotBeforeRound(tx, roundId);
  const recalculated = calculateRoundRows(
    round.entries.map((entry) => ({
      playerId: entry.playerId,
      playerName: entry.player.name,
      team: (entry.team as TeamCode | null) ?? null,
      holeScores: getHoleScores(entry),
      startQuota: quotaMap[entry.playerId] ?? entry.startQuota
    }))
  );

  for (const row of recalculated) {
    const matchingEntry = round.entries.find((entry) => entry.playerId === row.playerId);

    if (!matchingEntry) {
      continue;
    }

    await tx.roundEntry.update({
      where: { id: matchingEntry.id },
      data: {
        team: row.team,
        startQuota: row.startQuota,
        frontQuota: row.frontQuota,
        backQuota: row.backQuota,
        frontNine: row.frontNine,
        backNine: row.backNine,
        frontPlusMinus: row.frontPlusMinus,
        backPlusMinus: row.backPlusMinus,
        totalPoints: row.totalPoints,
        plusMinus: row.plusMinus,
        nextQuota: row.nextQuota,
        rank: row.rank
      }
    });
  }

  await persistRoundSummaries(tx, roundId, recalculated);
}

export async function finalizeRound(tx: Tx, roundId: string) {
  const pendingBackNine = await tx.roundEntry.count({
    where: {
      roundId,
      backSubmittedAt: null
    }
  });

  if (pendingBackNine > 0) {
    throw new Error("All players must submit their back nine before completing the round.");
  }

  const finalizedAt = new Date();

  await syncRoundComputedState(tx, roundId);
  await tx.round.update({
    where: { id: roundId },
    data: {
      completedAt: finalizedAt,
      roundDate: finalizedAt,
      roundName: formatRoundNameFromDate(finalizedAt)
    }
  });

  await recomputeHistoricalState(tx);
}

export async function recomputeHistoricalState(tx: Tx) {
  const players = await tx.player.findMany({
    orderBy: { name: "asc" }
  });

  // Historical rebuilds must always start from each player's base quota so
  // bad live quota values cannot contaminate earlier rounds.
  const baseQuotaMap = new Map(players.map((player) => [player.id, player.startingQuota]));
  const quotaMap = new Map<string, number>();

  const rounds = await tx.round.findMany({
    where: {
      completedAt: {
        not: null
      }
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
        }
      }
    },
    orderBy: [{ completedAt: "asc" }, { roundDate: "asc" }, { createdAt: "asc" }]
  });

  for (const round of rounds) {
    if (!round.entries.length) {
      continue;
    }

    const recalculated = calculateRoundRows(
      round.entries.map((entry) => ({
        playerId: entry.playerId,
        playerName: entry.player.name,
        team: (entry.team as TeamCode | null) ?? null,
        holeScores: getHoleScores(entry),
        startQuota: resolveHistoricalStartQuota(
          quotaMap.get(entry.playerId),
          entry.startQuota,
          baseQuotaMap.get(entry.playerId)
        )
      }))
    );

    for (const row of recalculated) {
      const matchingEntry = round.entries.find((entry) => entry.playerId === row.playerId);

      if (!matchingEntry) {
        continue;
      }

      await tx.roundEntry.update({
        where: { id: matchingEntry.id },
        data: {
          team: row.team,
          startQuota: row.startQuota,
          frontQuota: row.frontQuota,
          backQuota: row.backQuota,
          frontNine: row.frontNine,
          backNine: row.backNine,
          frontPlusMinus: row.frontPlusMinus,
          backPlusMinus: row.backPlusMinus,
          totalPoints: row.totalPoints,
          plusMinus: row.plusMinus,
          nextQuota: row.nextQuota,
          rank: row.rank
        }
      });

      if (!shouldSkipQuotaProgression(round)) {
        quotaMap.set(row.playerId, row.nextQuota);
      }
    }

    await persistRoundSummaries(tx, round.id, recalculated);
  }

  for (const player of players) {
    const nextQuota =
      quotaMap.get(player.id) ?? baseQuotaMap.get(player.id) ?? player.startingQuota;

    await tx.player.update({
      where: { id: player.id },
      data: {
        quota: nextQuota,
        currentQuota: nextQuota
      }
    });
  }
}

export async function getQuotaSnapshotBeforeRound(tx: Tx, roundId: string) {
  const players = await tx.player.findMany({
    orderBy: { name: "asc" }
  });

  const targetRound = await tx.round.findUnique({
    where: { id: roundId },
    select: {
      id: true
    }
  });

  if (!targetRound) {
    throw new Error("Round not found");
  }

  const baseQuotaMap = new Map(players.map((player) => [player.id, player.startingQuota]));
  const quotaMap = new Map<string, number>();

  const completedRounds = await tx.round.findMany({
    where: {
      completedAt: {
        not: null
      }
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
        }
      }
    },
    orderBy: [{ completedAt: "asc" }, { roundDate: "asc" }, { createdAt: "asc" }]
  });

  for (const round of completedRounds) {
    if (round.id === targetRound.id) {
      break;
    }

    const recalculated = calculateRoundRows(
      round.entries.map((entry) => ({
        playerId: entry.playerId,
        playerName: entry.player.name,
        team: (entry.team as TeamCode | null) ?? null,
        holeScores: getHoleScores(entry),
        startQuota: resolveHistoricalStartQuota(
          quotaMap.get(entry.playerId),
          entry.startQuota,
          baseQuotaMap.get(entry.playerId)
        )
      }))
    );

    for (const row of recalculated) {
      if (!shouldSkipQuotaProgression(round)) {
        quotaMap.set(row.playerId, row.nextQuota);
      }
    }
  }

  return Object.fromEntries(
    players.map((player) => [
      player.id,
      quotaMap.get(player.id) ?? baseQuotaMap.get(player.id) ?? player.startingQuota
    ])
  );
}

export async function createOrReplaceRoundEntries(
  tx: Tx,
  input: {
    roundId: string;
    roundName: string;
    roundDate: Date;
    roundMode: RoundMode;
    isTestRound?: boolean;
    notes?: string | null;
    teamCount?: number | null;
    lockedAt?: Date | null;
    startedAt?: Date | null;
    forceComplete?: boolean;
    entries: HoleEntryPayload[];
  }
) {
  const sequencesAreValid = input.entries.every((entry) => hasSequentialHoleEntry(entry.holes));
  if (!sequencesAreValid) {
    throw new Error("Hole scores must be entered in order without skipping.");
  }

  const existingEntries = await tx.roundEntry.findMany({
    where: { roundId: input.roundId },
    select: {
      id: true,
      playerId: true
    }
  });

  const existingByPlayerId = new Map(existingEntries.map((entry) => [entry.playerId, entry]));

  await tx.round.update({
    where: { id: input.roundId },
    data: {
      roundName: input.roundName,
      roundDate: input.roundDate,
      roundMode: input.roundMode,
      isTestRound: Boolean(input.isTestRound),
      notes: input.notes?.trim() ? input.notes.trim() : null,
      teamCount: input.roundMode === "SKINS_ONLY" ? null : input.teamCount ?? null,
      lockedAt: input.lockedAt ?? null,
      startedAt: input.startedAt ?? null,
      completedAt: input.forceComplete ? new Date() : null
    }
  });

  const nextPlayerIds = new Set(input.entries.map((entry) => entry.playerId));

  const removedEntryIds = existingEntries
    .filter((entry) => !nextPlayerIds.has(entry.playerId))
    .map((entry) => entry.id);

  if (removedEntryIds.length) {
    await tx.roundEntry.deleteMany({
      where: {
        id: {
          in: removedEntryIds
        }
      }
    });
  }

  for (const entry of input.entries) {
    const { frontNine, backNine, totalPoints } = calculateTotals(entry.holes);
    const existingEntry = existingByPlayerId.get(entry.playerId);
    const baseData = {
      team: entry.team,
      groupNumber: entry.groupNumber ?? null,
      teeTime: entry.teeTime ?? null,
      frontSubmittedAt: entry.frontSubmittedAt ?? null,
      backSubmittedAt: entry.backSubmittedAt ?? null,
      ...buildHoleFields(entry.holes),
      frontNine,
      backNine,
      totalPoints
    };

    if (existingEntry) {
      await tx.roundEntry.update({
        where: { id: existingEntry.id },
        data: baseData
      });
    } else {
      await tx.roundEntry.create({
        data: {
          roundId: input.roundId,
          playerId: entry.playerId,
          startQuota: 0,
          frontQuota: 0,
          backQuota: 0,
          frontPlusMinus: 0,
          backPlusMinus: 0,
          plusMinus: 0,
          nextQuota: 0,
          rank: 0,
          ...baseData
        }
      });
    }
  }

  if (input.forceComplete) {
    await syncRoundComputedState(tx, input.roundId);
    await recomputeHistoricalState(tx);
    await syncRoundComputedState(tx, input.roundId);
  }
}


