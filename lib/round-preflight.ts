import type { Prisma, PrismaClient } from "@prisma/client";
import { parseGoodSkinEntriesInput } from "@/lib/quota";
import { getRoundCompletionPreview } from "@/lib/round-service";

type Tx = Prisma.TransactionClient | PrismaClient;

export type RoundPostingPreflightIssueCode =
  | "ROUND_NOT_FOUND"
  | "ROUND_CANCELED"
  | "ROUND_ALREADY_POSTED"
  | "NO_PLAYERS"
  | "DUPLICATE_PLAYER"
  | "MISSING_SCORE"
  | "INCOMPLETE_SCORE"
  | "INVALID_SKIN"
  | "QUOTA_PREVIEW_MISMATCH"
  | "UNKNOWN_VALIDATION_ERROR";

export type RoundPostingPreflightIssue = {
  code: RoundPostingPreflightIssueCode;
  message: string;
  playerId?: string;
  playerName?: string;
  field?: string;
};

export type RoundPostingPreflightSummary = {
  roundId: string;
  roundName?: string;
  playerCount: number;
  submittedScoreCount: number;
  skinEntryCount: number;
};

export type RoundPostingBackupSnapshot = {
  exportedAt: string;
  round: {
    id: string;
    roundName: string;
    roundMode: string;
    scoringEntryMode: string | null;
    isTestRound: boolean;
    roundDate: string;
    createdAt: string;
    completedAt: string | null;
    canceledAt: string | null;
  };
  entries: Array<{
    playerId: string;
    playerName: string;
    team: string | null;
    groupNumber: number | null;
    startQuota: number;
    quickFrontNine: number | null;
    quickBackNine: number | null;
    totalPoints: number;
    plusMinus: number;
    nextQuota: number;
    skinEntries: ReturnType<typeof parseGoodSkinEntriesInput>;
  }>;
};

export type RoundPostingPreflightResult = {
  ok: boolean;
  errors: RoundPostingPreflightIssue[];
  warnings: RoundPostingPreflightIssue[];
  summary: RoundPostingPreflightSummary;
  backupSnapshot: RoundPostingBackupSnapshot | null;
};

export type RoundPostingPreflightInput = {
  id: string;
  roundName: string;
  roundMode: string;
  scoringEntryMode?: string | null;
  isTestRound?: boolean;
  roundDate: Date;
  createdAt: Date;
  completedAt?: Date | null;
  canceledAt?: Date | null;
  entries: Array<{
    playerId: string;
    player?: { name: string } | null;
    team?: string | null;
    groupNumber?: number | null;
    startQuota: number;
    quickFrontNine?: number | null;
    quickBackNine?: number | null;
    frontSubmittedAt?: Date | null;
    backSubmittedAt?: Date | null;
    totalPoints: number;
    plusMinus: number;
    nextQuota: number;
    birdieHolesCsv?: string | null;
  }>;
};

function normalizeScoringEntryMode(value: string | null | undefined) {
  return value === "QUICK" ? "QUICK" : "DETAILED";
}

function getPlayerName(entry: RoundPostingPreflightInput["entries"][number]) {
  return entry.player?.name ?? "Unknown Player";
}

function buildSummary(round: RoundPostingPreflightInput): RoundPostingPreflightSummary {
  return {
    roundId: round.id,
    roundName: round.roundName,
    playerCount: round.entries.length,
    submittedScoreCount: round.entries.filter((entry) => {
      if (round.roundMode === "SKINS_ONLY") {
        return entry.quickFrontNine != null && entry.frontSubmittedAt && entry.backSubmittedAt;
      }

      return (
        entry.quickFrontNine != null &&
        entry.quickBackNine != null &&
        entry.frontSubmittedAt &&
        entry.backSubmittedAt
      );
    }).length,
    skinEntryCount: round.entries.reduce(
      (total, entry) => total + parseGoodSkinEntriesInput(entry.birdieHolesCsv ?? "").length,
      0
    )
  };
}

export function buildRoundPostingBackupSnapshot(round: RoundPostingPreflightInput): RoundPostingBackupSnapshot {
  return {
    exportedAt: new Date().toISOString(),
    round: {
      id: round.id,
      roundName: round.roundName,
      roundMode: round.roundMode,
      scoringEntryMode: round.scoringEntryMode ?? null,
      isTestRound: Boolean(round.isTestRound),
      roundDate: round.roundDate.toISOString(),
      createdAt: round.createdAt.toISOString(),
      completedAt: round.completedAt?.toISOString() ?? null,
      canceledAt: round.canceledAt?.toISOString() ?? null
    },
    entries: round.entries.map((entry) => ({
      playerId: entry.playerId,
      playerName: getPlayerName(entry),
      team: entry.team ?? null,
      groupNumber: entry.groupNumber ?? null,
      startQuota: entry.startQuota,
      quickFrontNine: entry.quickFrontNine ?? null,
      quickBackNine: entry.quickBackNine ?? null,
      totalPoints: entry.totalPoints,
      plusMinus: entry.plusMinus,
      nextQuota: entry.nextQuota,
      skinEntries: parseGoodSkinEntriesInput(entry.birdieHolesCsv ?? "")
    }))
  };
}

export function validateRoundPostingPreflightDto(round: RoundPostingPreflightInput): RoundPostingPreflightResult {
  const errors: RoundPostingPreflightIssue[] = [];
  const warnings: RoundPostingPreflightIssue[] = [];
  const scoringEntryMode = normalizeScoringEntryMode(round.scoringEntryMode);
  const isIndividualQuotaSkins = round.roundMode === "SKINS_ONLY";
  const seenPlayerIds = new Set<string>();

  if (round.canceledAt) {
    errors.push({
      code: "ROUND_CANCELED",
      message: "Canceled rounds cannot be posted."
    });
  }

  if (round.completedAt) {
    errors.push({
      code: "ROUND_ALREADY_POSTED",
      message: "This round has already been posted."
    });
  }

  if (!round.entries.length) {
    errors.push({
      code: "NO_PLAYERS",
      message: "No players are assigned to this round."
    });
  }

  for (const entry of round.entries) {
    const playerName = getPlayerName(entry);

    if (seenPlayerIds.has(entry.playerId)) {
      errors.push({
        code: "DUPLICATE_PLAYER",
        message: `Duplicate score entry for ${playerName}.`,
        playerId: entry.playerId,
        playerName
      });
    }
    seenPlayerIds.add(entry.playerId);

    if (scoringEntryMode === "QUICK") {
      if (isIndividualQuotaSkins) {
        if (entry.quickFrontNine == null) {
          errors.push({
            code: "MISSING_SCORE",
            message: `Missing score: ${playerName}`,
            playerId: entry.playerId,
            playerName,
            field: "total"
          });
        } else if (!entry.frontSubmittedAt || !entry.backSubmittedAt) {
          errors.push({
            code: "INCOMPLETE_SCORE",
            message: `Incomplete score: ${playerName} needs Save`,
            playerId: entry.playerId,
            playerName,
            field: "save"
          });
        }
      } else if (entry.quickFrontNine == null && entry.quickBackNine == null) {
        errors.push({
          code: "MISSING_SCORE",
          message: `Missing scores: ${playerName}`,
          playerId: entry.playerId,
          playerName
        });
      } else if (entry.quickFrontNine == null) {
        errors.push({
          code: "INCOMPLETE_SCORE",
          message: `Incomplete score: ${playerName} needs Front 9`,
          playerId: entry.playerId,
          playerName,
          field: "front"
        });
      } else if (entry.quickBackNine == null) {
        errors.push({
          code: "INCOMPLETE_SCORE",
          message: `Incomplete score: ${playerName} needs Back 9`,
          playerId: entry.playerId,
          playerName,
          field: "back"
        });
      } else if (!entry.frontSubmittedAt || !entry.backSubmittedAt) {
        errors.push({
          code: "INCOMPLETE_SCORE",
          message: `Incomplete score: ${playerName} needs Save`,
          playerId: entry.playerId,
          playerName,
          field: "save"
        });
      }
      continue;
    }

    if (!entry.frontSubmittedAt && !entry.backSubmittedAt) {
      errors.push({
        code: "MISSING_SCORE",
        message: `Missing scores: ${playerName}`,
        playerId: entry.playerId,
        playerName
      });
    } else if (!entry.frontSubmittedAt) {
      errors.push({
        code: "INCOMPLETE_SCORE",
        message: `Incomplete score: ${playerName} needs Front 9`,
        playerId: entry.playerId,
        playerName,
        field: "front"
      });
    } else if (!entry.backSubmittedAt) {
      errors.push({
        code: "INCOMPLETE_SCORE",
        message: `Incomplete score: ${playerName} needs Back 9`,
        playerId: entry.playerId,
        playerName,
        field: "back"
      });
    }
  }

  const summary = buildSummary(round);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary,
    backupSnapshot: buildRoundPostingBackupSnapshot(round)
  };
}

export function formatRoundPostingPreflightError(result: RoundPostingPreflightResult) {
  if (result.ok) {
    return null;
  }

  const messages = result.errors.map((issue) => issue.message);
  return messages.length ? messages.join(" ") : "Round cannot be posted yet.";
}

export async function validateRoundPostingPreflight(tx: Tx, roundId: string) {
  const round = await tx.round.findUnique({
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
          playerId: "asc"
        }
      }
    }
  });

  if (!round) {
    return {
      ok: false,
      errors: [
        {
          code: "ROUND_NOT_FOUND",
          message: "Round not found"
        } satisfies RoundPostingPreflightIssue
      ],
      warnings: [],
      summary: {
        roundId,
        playerCount: 0,
        submittedScoreCount: 0,
        skinEntryCount: 0
      },
      backupSnapshot: null
    };
  }

  const result = validateRoundPostingPreflightDto(round);

  if (!result.ok) {
    return result;
  }

  try {
    const preview = await getRoundCompletionPreview(tx, roundId);

    if (preview.validation.mismatchCount > 0) {
      const affectedPlayers = Array.from(
        new Set(preview.validation.issues.map((issue) => issue.playerName))
      ).filter(Boolean);

      return {
        ...result,
        ok: false,
        errors: [
          ...result.errors,
          {
            code: "QUOTA_PREVIEW_MISMATCH",
            message: affectedPlayers.length
              ? `Quota validation failed. Check: ${affectedPlayers.join(", ")}.`
              : "Quota validation failed. Check the quota preview before posting."
          } satisfies RoundPostingPreflightIssue
        ]
      };
    }
  } catch (error) {
    return {
      ...result,
      ok: false,
      errors: [
        ...result.errors,
        {
          code: "UNKNOWN_VALIDATION_ERROR",
          message: error instanceof Error ? error.message : "Round validation failed before posting."
        } satisfies RoundPostingPreflightIssue
      ]
    };
  }

  return result;
}
