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
import { validateAllPlayerQuotas, type PlayerQuotaValidationInput } from "@/lib/quota-history";
import { getMissingBaselineQuota2026, requireBaselineQuota2026 } from "@/lib/baseline-quotas-2026";
import { formatRoundNameFromDate } from "@/lib/utils";
import { getSeasonStartDate } from "@/lib/season";

type Tx = Prisma.TransactionClient | PrismaClient;
type HoleFieldName = (typeof holeFieldNames)[number];

export type HistoricalRecomputeResult = {
  roundsProcessed: number;
  roundEntriesUpdated: number;
  playersUpdated: number;
  mismatchCount: number;
};

type HoleEntryPayload = {
  playerId: string;
  team: TeamCode | null;
  groupNumber?: number | null;
  teeTime?: string | null;
  frontSubmittedAt?: Date | null;
  backSubmittedAt?: Date | null;
  holes: Array<number | null>;
};

type CompletionPreviewValidation = ReturnType<typeof validateAllPlayerQuotas>;

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
  baseQuota: number | undefined
) {
  if (priorQuota != null) {
    return priorQuota;
  }

  if (baseQuota != null) {
    return baseQuota;
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
              name: true,
              startingQuota: true
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
      startQuota: quotaMap[entry.playerId] ?? requireBaselineQuota2026(entry.player.name)
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

async function buildQuotaValidationSummary(
  tx: Tx,
  args: {
    roundId: string;
    roundName: string;
    roundDate: Date;
    completedAt: Date | null;
    createdAt: Date;
    readOnly: boolean;
    previewRows: Array<{
      playerId: string;
      playerName: string;
      startQuota: number;
      totalPoints: number;
      quotaAdjustment: number;
      nextQuota: number;
    }>;
  }
): Promise<CompletionPreviewValidation> {
  const players = await tx.player.findMany({
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
              not: null
            }
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

  const previewRowsByPlayerId = new Map(args.previewRows.map((row) => [row.playerId, row]));

  const validationInputs: Array<PlayerQuotaValidationInput> = players.map((player) => {
    const rounds = player.roundEntries.map((entry) => ({
      roundId: entry.round.id,
      roundName: entry.round.roundName,
      roundDate: entry.round.roundDate,
      completedAt: entry.round.completedAt,
      createdAt: entry.round.createdAt,
      totalPoints: entry.totalPoints,
      startQuota: entry.startQuota,
      plusMinus: entry.plusMinus,
      nextQuota: entry.nextQuota
    }));

    const previewRow = previewRowsByPlayerId.get(player.id);

    if (!args.readOnly && previewRow) {
      rounds.push({
        roundId: args.roundId,
        roundName: args.roundName,
        roundDate: args.roundDate,
        completedAt: args.completedAt,
        createdAt: args.createdAt,
        totalPoints: previewRow.totalPoints,
        startQuota: previewRow.startQuota,
        plusMinus: previewRow.totalPoints - previewRow.startQuota,
        nextQuota: previewRow.nextQuota
      });
    }

    return {
      playerId: player.id,
      playerName: player.name,
      baselineQuota: requireBaselineQuota2026(player.name),
      currentQuota:
        !args.readOnly && previewRow
          ? previewRow.nextQuota
          : player.currentQuota ?? player.quota ?? player.startingQuota,
      rounds
    };
  });

  return validateAllPlayerQuotas(validationInputs);
}

function buildBaselineQuotaMap(players: Array<{ id: string; name: string }>) {
  const missingBaselinePlayers = getMissingBaselineQuota2026(players.map((player) => player.name));

  if (missingBaselinePlayers.length > 0) {
    throw new Error(
      `Missing 2026 baseline quota for: ${missingBaselinePlayers.join(", ")}. Rebuild skipped.`
    );
  }

  return new Map(
    players.map((player) => [player.id, requireBaselineQuota2026(player.name)])
  );
}

async function buildStoredQuotaValidationSummary(tx: Tx) {
  const seasonStartDate = await getSeasonStartDate(tx);

  const players = await tx.player.findMany({
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

  return validateAllPlayerQuotas(
    players.map((player) => ({
      playerId: player.id,
      playerName: player.name,
      baselineQuota: requireBaselineQuota2026(player.name),
      currentQuota: player.currentQuota,
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
}
export async function getRoundCompletionPreview(tx: Tx, roundId: string) {
  const round = await tx.round.findUnique({
    where: { id: roundId },
    include: {
      entries: {
        include: {
          player: {
            select: {
              id: true,
              name: true,
              startingQuota: true
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

  if (round.canceledAt) {
    throw new Error("Canceled rounds cannot be posted.");
  }

  const readOnly = Boolean(round.completedAt);
  const pendingBackNine = round.entries.filter((entry) => !entry.backSubmittedAt).length;

  if (!readOnly && pendingBackNine > 0) {
    throw new Error("All players must submit their back nine before completing the round.");
  }

  const quotaMap = await getQuotaSnapshotBeforeRound(tx, roundId);
  const recalculated = calculateRoundRows(
    round.entries.map((entry) => ({
      playerId: entry.playerId,
      playerName: entry.player.name,
      team: (entry.team as TeamCode | null) ?? null,
      holeScores: getHoleScores(entry),
      startQuota: quotaMap[entry.playerId] ?? requireBaselineQuota2026(entry.player.name)
    }))
  );

  const previewRows = recalculated
    .map((row) => ({
      playerId: row.playerId,
      playerName: row.playerName,
      startQuota: row.startQuota,
      totalPoints: row.totalPoints,
      quotaAdjustment: row.nextQuota - row.startQuota,
      nextQuota: row.nextQuota
    }))
    .sort((left, right) => left.playerName.localeCompare(right.playerName));

  const validation = await buildQuotaValidationSummary(tx, {
    roundId: round.id,
    roundName: round.roundName,
    roundDate: round.roundDate,
    completedAt: round.completedAt,
    createdAt: round.createdAt,
    readOnly,
    previewRows
  });

  return {
    roundId: round.id,
    isTestRound: Boolean(round.isTestRound),
    readOnly,
    approvedAt: round.completedAt ? round.completedAt.toISOString() : null,
    warning: readOnly
      ? "These quota changes were already approved and saved for this round."
      : Boolean(round.isTestRound)
        ? "Review carefully. This is a test round, so quotas will not be updated when you post it."
        : "Review carefully. These quotas will be used for the next round.",
    rows: previewRows,
    validation
  };
}

export async function finalizeRound(tx: Tx, roundId: string) {
  const round = await tx.round.findUnique({
    where: { id: roundId },
    select: {
      id: true,
      completedAt: true,
      canceledAt: true
    }
  });

  if (!round) {
    throw new Error("Round not found");
  }

  if (round.canceledAt) {
    throw new Error("Canceled rounds cannot be posted.");
  }

  if (round.completedAt) {
    throw new Error("This round has already been posted.");
  }

  const pendingBackNine = await tx.roundEntry.count({
    where: {
      roundId,
      backSubmittedAt: null
    }
  });

  if (pendingBackNine > 0) {
    throw new Error("All players must submit their back nine before completing the round.");
  }

  const preview = await getRoundCompletionPreview(tx, roundId);

  if (preview.validation.mismatchCount > 0) {
    const affectedPlayers = Array.from(
      new Set(preview.validation.issues.map((issue) => issue.playerName))
    );
    throw new Error(`Quota validation failed. Check: ${affectedPlayers.join(", ")}.`);
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

export async function recomputeHistoricalState(tx: Tx): Promise<HistoricalRecomputeResult> {
  const seasonStartDate = await getSeasonStartDate(tx);
  const players = await tx.player.findMany({
    orderBy: { name: "asc" }
  });

  // Historical rebuilds must always start from each player's locked 2026 baseline
  // so stale live quotas and pre-season rounds cannot contaminate the chain.
  const quotaMap = new Map<string, number>();
  const baseQuotaMap = buildBaselineQuotaMap(players);
  let roundEntriesUpdated = 0;
  let playersUpdated = 0;

  const rounds = await tx.round.findMany({
    where: {
      completedAt: {
        not: null,
        gte: seasonStartDate
      },
      canceledAt: null
    },
    include: {
      entries: {
        include: {
          player: {
            select: {
              id: true,
              name: true,
              startingQuota: true
            }
          }
        }
      }
    },
    orderBy: [{ completedAt: "asc" }, { roundDate: "asc" }, { createdAt: "asc" }]
  });

  console.info("[quota-rebuild] baseline", {
    playerName: "Bob Lipski",
    baselineQuota: players.find((player) => player.name === "Bob Lipski") ? requireBaselineQuota2026("Bob Lipski") : null
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
          baseQuotaMap.get(entry.playerId)
        )
      }))
    );

    for (const row of recalculated) {
      const matchingEntry = round.entries.find((entry) => entry.playerId === row.playerId);

      if (!matchingEntry) {
        continue;
      }



      if (row.playerName === "John Thomas") {
        console.info("[quota-rebuild] Saving John Thomas round", {
          roundName: round.roundName,
          completedAt: round.completedAt,
          startingQuota: row.startQuota,
          pointsScored: row.totalPoints,
          resultVsQuota: row.plusMinus,
          quotaAdjustment: row.nextQuota - row.startQuota,
          newQuota: row.nextQuota
        });
      }

      const persistedEntry = await tx.roundEntry.update({
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
        },
        select: {
          id: true,
          startQuota: true,
          totalPoints: true,
          plusMinus: true,
          nextQuota: true
        }
      });

      if (
        persistedEntry.startQuota !== row.startQuota ||
        persistedEntry.totalPoints !== row.totalPoints ||
        persistedEntry.plusMinus !== row.plusMinus ||
        persistedEntry.nextQuota !== row.nextQuota
      ) {
        throw new Error(
          "Round entry persistence failed for " +
            row.playerName +
            " in round " +
            (round.roundName ?? round.id) +
            "."
        );
      }

      if (row.playerName === "John Thomas") {
        console.info("[quota-rebuild] Saved John Thomas round", {
          roundName: round.roundName,
          completedAt: round.completedAt,
          startingQuota: persistedEntry.startQuota,
          pointsScored: persistedEntry.totalPoints,
          resultVsQuota: persistedEntry.plusMinus,
          quotaAdjustment: persistedEntry.nextQuota - persistedEntry.startQuota,
          newQuota: persistedEntry.nextQuota
        });
      }

      roundEntriesUpdated += 1;

      if (row.playerName === "Bob Lipski") {
        console.info("[quota-rebuild] Bob Lipski persisted repair", {
          roundName: round.roundName,
          completedAt: round.completedAt,
          baseline: requireBaselineQuota2026("Bob Lipski"),
          storedBefore: matchingEntry.startQuota,
          storedAfter: row.startQuota,
          points: row.totalPoints,
          result: row.plusMinus,
          adjustment: row.nextQuota - row.startQuota,
          newQuota: row.nextQuota
        });
      }

      if (!shouldSkipQuotaProgression(round)) {
        quotaMap.set(row.playerId, row.nextQuota);
      }
    }

    await persistRoundSummaries(tx, round.id, recalculated);
  }

  const expectedQuotaByPlayerId = new Map<string, { name: string; baselineQuota: number; nextQuota: number }>();

  for (const player of players) {
    const baselineQuota = baseQuotaMap.get(player.id) ?? requireBaselineQuota2026(player.name);
    const nextQuota = quotaMap.get(player.id) ?? baselineQuota;

    expectedQuotaByPlayerId.set(player.id, {
      name: player.name,
      baselineQuota,
      nextQuota
    });

    const hasPlayerChanges =
      player.quota !== nextQuota ||
      player.currentQuota !== nextQuota ||
      player.startingQuota !== baselineQuota;

    if (player.name === "John Thomas") {
      console.info("[quota-rebuild] Saving John Thomas quota", {
        baselineQuota,
        valueBeforeSave: player.currentQuota,
        finalComputedQuota: nextQuota
      });
    }

    const persistedPlayer = await tx.player.update({
      where: { id: player.id },
      data: {
        quota: nextQuota,
        currentQuota: nextQuota,
        startingQuota: baselineQuota
      },
      select: {
        id: true,
        name: true,
        quota: true,
        currentQuota: true,
        startingQuota: true
      }
    });

    if (
      persistedPlayer.currentQuota !== nextQuota ||
      persistedPlayer.quota !== nextQuota ||
      persistedPlayer.startingQuota !== baselineQuota
    ) {
      throw new Error(
        "Player quota persistence failed for " +
          persistedPlayer.name +
          ". Expected current quota " +
          nextQuota +
          ", found " +
          persistedPlayer.currentQuota +
          "."
      );
    }

    if (player.name === "John Thomas") {
      console.info("[quota-rebuild] Saved John Thomas quota", {
        baselineQuota,
        finalComputedQuota: nextQuota,
        storedCurrentQuotaAfterSave: persistedPlayer.currentQuota,
        storedQuotaAfterSave: persistedPlayer.quota,
        storedStartingQuotaAfterSave: persistedPlayer.startingQuota
      });
    }

    playersUpdated += 1;
  }

  const persistedPlayers = await tx.player.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      quota: true,
      currentQuota: true,
      startingQuota: true
    }
  });

  for (const player of persistedPlayers) {
    const expected = expectedQuotaByPlayerId.get(player.id);
    if (!expected) {
      continue;
    }

    if (player.name === "Bob Lipski") {
      console.info("[quota-rebuild] Bob Lipski final persisted quota", {
        baseline: expected.baselineQuota,
        finalComputedQuota: expected.nextQuota,
        storedCurrentQuotaAfterSave: player.currentQuota,
        storedQuotaAfterSave: player.quota,
        storedStartingQuotaAfterSave: player.startingQuota
      });
    }

    if (
      player.currentQuota !== expected.nextQuota ||
      player.quota !== expected.nextQuota ||
      player.startingQuota !== expected.baselineQuota
    ) {
      throw new Error(
        "Quota rebuild persistence failed for " +
          player.name +
          ". Expected current quota " +
          expected.nextQuota +
          " and baseline " +
          expected.baselineQuota +
          ", found current quota " +
          player.currentQuota +
          ", quota " +
          player.quota +
          ", baseline " +
          player.startingQuota +
          "."
      );
    }
  }

  const validation = await buildStoredQuotaValidationSummary(tx);
  if (validation.mismatchCount > 0) {
    const affectedPlayers = Array.from(new Set(validation.issues.map((issue) => issue.playerName)));
    throw new Error(`Quota rebuild validation failed. Check: ${affectedPlayers.join(", ")}.`);
  }

  return {
    roundsProcessed: rounds.length,
    roundEntriesUpdated,
    playersUpdated,
    mismatchCount: validation.mismatchCount
  };
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

  const quotaMap = new Map<string, number>();

  const seasonStartDate = await getSeasonStartDate(tx);

  const completedRounds = await tx.round.findMany({
    where: {
      completedAt: {
        not: null,
        gte: seasonStartDate
      },
      canceledAt: null
    },
    include: {
      entries: {
        include: {
          player: {
            select: {
              id: true,
              name: true,
              startingQuota: true
            }
          }
        }
      }
    },
    orderBy: [{ completedAt: "asc" }, { roundDate: "asc" }, { createdAt: "asc" }]
  });

  const baseQuotaMap = buildBaselineQuotaMap(players);

  console.info("[quota-rebuild] baseline", {
    playerName: "Bob Lipski",
    baselineQuota: players.find((player) => player.name === "Bob Lipski") ? requireBaselineQuota2026("Bob Lipski") : null
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
          baseQuotaMap.get(entry.playerId)
        )
      }))
    );

    for (const row of recalculated) {
      if (row.playerName === "Bob Lipski") {
        console.info("[quota-rebuild] Bob Lipski round", {
          roundName: round.roundName,
          completedAt: round.completedAt,
          startQuota: row.startQuota,
          totalPoints: row.totalPoints,
          result: row.plusMinus,
          adjustment: row.nextQuota - row.startQuota,
          newQuota: row.nextQuota
        });
      }

      if (!shouldSkipQuotaProgression(round)) {
        quotaMap.set(row.playerId, row.nextQuota);
      }
    }
  }

  return Object.fromEntries(
    players.map((player) => [
      player.id,
      quotaMap.get(player.id) ?? baseQuotaMap.get(player.id) ?? requireBaselineQuota2026(player.name)
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













