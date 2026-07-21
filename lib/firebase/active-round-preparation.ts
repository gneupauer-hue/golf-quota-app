import { IREM_FIREBASE_PROJECT_ID } from "@/lib/firebase/player-mirror-seed";
import {
  auditFirebaseRoundMirror,
  mapPrismaRoundToFirebaseMirror,
  type FirestoreActiveRoundPointerComparisonInput,
  type FirestoreRoundEntryMirrorComparisonInput,
  type FirestoreRoundMirrorComparisonInput,
  type PrismaRoundMirrorInput,
  type RoundMirrorAuditResult,
  type RoundMirrorMappingResult
} from "@/lib/firebase/round-mirror";
import {
  mapPrismaScoresToFirebaseMirror,
  type FirestoreScoreMirrorComparisonInput,
  type PrismaScoreMirrorRoundInput,
  type ScoreMirrorAuditResult,
  type ScoreMirrorMappingResult
} from "@/lib/firebase/score-mirror";
import type {
  FirebaseActiveRoundPointerMirror,
  FirebaseRoundEntryMirror,
  FirebaseRoundMirror,
  FirebaseScoreMirror
} from "@/lib/firebase/types";

export const IREM_FIREBASE_CLUB_ID = "eO5PwRmRZrQJW0VbEp0B";
export const ACTIVE_ROUND_PREPARATION_LOCK_ID = "activeRoundPreparation";
export const ACTIVE_ROUND_PREPARATION_STATE_ID = "activeRoundPreparation";

export type ActiveRoundPreparationStatus =
  | "ready"
  | "preparing"
  | "repair-needed"
  | "unavailable";

export type ActiveRoundPreparationErrorCode =
  | "disabled"
  | "no-active-round"
  | "round-mismatch"
  | "lock-active"
  | "malformed-round"
  | "malformed-entry"
  | "malformed-pointer"
  | "malformed-score"
  | "extra-score"
  | "write-limit"
  | "batch-failed"
  | "timeout"
  | "unknown";

export type ActiveRoundPreparationReadiness = {
  roundId: string | null;
  status: ActiveRoundPreparationStatus;
  updatedAt?: unknown;
  errorCode?: ActiveRoundPreparationErrorCode;
  preparedBy: "server";
  operationId?: string;
};

export type ActiveRoundPreparationFirestoreScore = FirestoreScoreMirrorComparisonInput & {
  prismaRoundId?: string;
  prismaEntryId?: string;
  source?: unknown;
  scoreVersion?: unknown;
  lastOperationId?: unknown;
  lastEditedByUid?: unknown;
  lastEditedAt?: unknown;
  lastClientRequestId?: unknown;
  holes?: unknown;
  quickFrontNine?: unknown;
  quickBackNine?: unknown;
  birdieHoles?: unknown;
};

export type ActiveRoundPreparationWriteInput = {
  round?: FirebaseRoundMirror;
  entries: FirebaseRoundEntryMirror[];
  activePointer?: FirebaseActiveRoundPointerMirror;
  scoresToCreate: FirebaseScoreMirror[];
  readiness: ActiveRoundPreparationReadiness;
};

export type ActiveRoundPreparationAdapters = {
  readActivePrismaRoundSetup: () => Promise<PrismaRoundMirrorInput | null>;
  readActivePrismaRoundScores: () => Promise<PrismaScoreMirrorRoundInput | null>;
  readFirestoreRound: (
    clubId: string,
    roundId: string
  ) => Promise<FirestoreRoundMirrorComparisonInput | null>;
  readFirestoreRoundEntries: (
    clubId: string,
    roundId: string
  ) => Promise<FirestoreRoundEntryMirrorComparisonInput[]>;
  readFirestoreActivePointer: (
    clubId: string
  ) => Promise<FirestoreActiveRoundPointerComparisonInput | null>;
  readFirestoreScores: (
    clubId: string,
    roundId: string
  ) => Promise<ActiveRoundPreparationFirestoreScore[]>;
  acquirePreparationLock: (
    clubId: string,
    operationId: string
  ) => Promise<(() => Promise<void>) | "preparing">;
  writePreparationBatch: (
    clubId: string,
    roundId: string,
    input: ActiveRoundPreparationWriteInput
  ) => Promise<number | void>;
  writeReadiness?: (
    clubId: string,
    readiness: ActiveRoundPreparationReadiness
  ) => Promise<void>;
  createOperationId?: () => string;
};

export type ActiveRoundPreparationResult = {
  ok: boolean;
  mode: "auto" | "repair";
  projectId: typeof IREM_FIREBASE_PROJECT_ID;
  clubId: string;
  operationId: string;
  roundId: string | null;
  status: ActiveRoundPreparationStatus;
  errorCode?: ActiveRoundPreparationErrorCode;
  message?: string;
  round?: RoundMirrorAuditResult["round"];
  entries?: RoundMirrorAuditResult["entries"];
  activePointer?: RoundMirrorAuditResult["activePointer"];
  scores?: ScoreMirrorAuditResult;
  writesPlanned: number;
  writesApplied: number;
};

const WRITE_LIMIT = 500;

function hasExtras(audit: RoundMirrorAuditResult) {
  return (
    audit.round.counts.extra > 0 ||
    audit.entries.counts.extra > 0 ||
    audit.activePointer.counts.extra > 0
  );
}

function validateRoundMirrorInputs(input: {
  round: FirestoreRoundMirrorComparisonInput | null;
  entries: FirestoreRoundEntryMirrorComparisonInput[];
  pointer: FirestoreActiveRoundPointerComparisonInput | null;
}) {
  if (input.round) {
    if (input.round.docId && input.round.prismaRoundId && input.round.docId !== input.round.prismaRoundId) {
      throw Object.assign(new Error("Malformed Firestore round shell."), {
        code: "malformed-round" satisfies ActiveRoundPreparationErrorCode
      });
    }
    if (typeof input.round.checksum !== "string" || !input.round.checksum.trim()) {
      throw Object.assign(new Error("Malformed Firestore round shell."), {
        code: "malformed-round" satisfies ActiveRoundPreparationErrorCode
      });
    }
  }

  const seen = new Set<string>();
  for (const entry of input.entries) {
    if (!entry.prismaPlayerId?.trim() || !entry.checksum?.trim()) {
      throw Object.assign(new Error("Malformed Firestore round entry."), {
        code: "malformed-entry" satisfies ActiveRoundPreparationErrorCode
      });
    }
    if (entry.docId && entry.docId !== entry.prismaPlayerId) {
      throw Object.assign(new Error("Malformed Firestore round entry."), {
        code: "malformed-entry" satisfies ActiveRoundPreparationErrorCode
      });
    }
    if (seen.has(entry.prismaPlayerId)) {
      throw Object.assign(new Error("Duplicate Firestore round entry."), {
        code: "malformed-entry" satisfies ActiveRoundPreparationErrorCode
      });
    }
    seen.add(entry.prismaPlayerId);
  }

  if (input.pointer) {
    if (
      !input.pointer.roundId?.trim() ||
      !input.pointer.prismaRoundId?.trim() ||
      input.pointer.roundId !== input.pointer.prismaRoundId ||
      !input.pointer.checksum?.trim()
    ) {
      throw Object.assign(new Error("Malformed Firestore active-round pointer."), {
        code: "malformed-pointer" satisfies ActiveRoundPreparationErrorCode
      });
    }
  }
}

function validateExistingScores(
  expected: ScoreMirrorMappingResult,
  firestoreScores: ActiveRoundPreparationFirestoreScore[]
) {
  const expectedByPlayerId = new Map(expected.scores.map((score) => [score.prismaPlayerId, score]));
  const seen = new Set<string>();

  for (const score of firestoreScores) {
    const playerId = score.prismaPlayerId ?? score.docId;
    if (typeof playerId !== "string" || !playerId.trim()) {
      throw Object.assign(new Error("Malformed Firestore score mirror."), {
        code: "malformed-score" satisfies ActiveRoundPreparationErrorCode
      });
    }
    if (score.docId && score.docId !== playerId) {
      throw Object.assign(new Error("Malformed Firestore score mirror."), {
        code: "malformed-score" satisfies ActiveRoundPreparationErrorCode
      });
    }
    if (seen.has(playerId)) {
      throw Object.assign(new Error("Duplicate Firestore score mirror."), {
        code: "malformed-score" satisfies ActiveRoundPreparationErrorCode
      });
    }
    seen.add(playerId);

    const expectedScore = expectedByPlayerId.get(playerId);
    if (!expectedScore) {
      throw Object.assign(new Error("Extra Firestore score mirror."), {
        code: "extra-score" satisfies ActiveRoundPreparationErrorCode
      });
    }
    if (
      score.prismaRoundId !== expectedScore.prismaRoundId ||
      score.prismaEntryId !== expectedScore.prismaEntryId ||
      score.prismaPlayerId !== expectedScore.prismaPlayerId ||
      (score.source !== "prisma" && score.source !== "firestore-test") ||
      typeof score.scoreVersion !== "number" ||
      !Number.isInteger(score.scoreVersion) ||
      score.scoreVersion < 1 ||
      typeof score.checksum !== "string" ||
      !score.checksum.trim()
    ) {
      throw Object.assign(new Error("Malformed Firestore score mirror."), {
        code: "malformed-score" satisfies ActiveRoundPreparationErrorCode
      });
    }
  }
}

function auditPreparationScores(
  expected: ScoreMirrorMappingResult,
  firestoreScores: ActiveRoundPreparationFirestoreScore[]
): ScoreMirrorAuditResult {
  const existingIds = new Set(
    firestoreScores
      .map((score) => score.prismaPlayerId ?? score.docId)
      .filter((playerId): playerId is string => typeof playerId === "string")
  );
  const created = expected.scores
    .filter((score) => !existingIds.has(score.prismaPlayerId))
    .map((score) => ({
      playerId: score.prismaPlayerId,
      playerName: expected.playerNamesById[score.prismaPlayerId] ?? null
    }));
  const unchanged = expected.scores
    .filter((score) => existingIds.has(score.prismaPlayerId))
    .map((score) => ({
      playerId: score.prismaPlayerId,
      playerName: expected.playerNamesById[score.prismaPlayerId] ?? null
    }));

  return {
    counts: {
      created: created.length,
      updated: 0,
      unchanged: unchanged.length,
      extra: 0
    },
    created: created.sort((left, right) => left.playerId.localeCompare(right.playerId)),
    updated: [],
    unchanged: unchanged.sort((left, right) => left.playerId.localeCompare(right.playerId)),
    extra: []
  };
}

function buildWritableRoundInput(expected: RoundMirrorMappingResult, audit: RoundMirrorAuditResult) {
  const writableEntryIds = new Set([...audit.entries.createdIds, ...audit.entries.updatedIds]);
  return {
    round: audit.round.counts.created || audit.round.counts.updated ? expected.round : undefined,
    entries: expected.entries.filter((entry) => writableEntryIds.has(entry.prismaPlayerId)),
    activePointer:
      audit.activePointer.counts.created || audit.activePointer.counts.updated
        ? expected.activePointer
        : undefined
  };
}

function readiness(input: {
  operationId: string;
  roundId: string | null;
  status: ActiveRoundPreparationStatus;
  errorCode?: ActiveRoundPreparationErrorCode;
}): ActiveRoundPreparationReadiness {
  return {
    roundId: input.roundId,
    status: input.status,
    errorCode: input.errorCode,
    preparedBy: "server",
    operationId: input.operationId
  };
}

function countWrites(input: ActiveRoundPreparationWriteInput) {
  return (
    (input.round ? 1 : 0) +
    input.entries.length +
    (input.activePointer ? 1 : 0) +
    input.scoresToCreate.length +
    1
  );
}

function failure(input: {
  clubId: string;
  errorCode: ActiveRoundPreparationErrorCode;
  mode: "auto" | "repair";
  operationId: string;
  roundId: string | null;
  status?: ActiveRoundPreparationStatus;
  message?: string;
}): ActiveRoundPreparationResult {
  return {
    ok: false,
    mode: input.mode,
    projectId: IREM_FIREBASE_PROJECT_ID,
    clubId: input.clubId,
    operationId: input.operationId,
    roundId: input.roundId,
    status: input.status ?? "repair-needed",
    errorCode: input.errorCode,
    message: input.message ?? "Round started, but realtime sync needs repair.",
    writesPlanned: 0,
    writesApplied: 0
  };
}

export async function prepareActiveRoundFirestoreMirror(input: {
  adapters: ActiveRoundPreparationAdapters;
  clubId?: string;
  expectedPrismaRoundId: string;
  mode: "auto" | "repair";
}): Promise<ActiveRoundPreparationResult> {
  const clubId = input.clubId ?? IREM_FIREBASE_CLUB_ID;
  const operationId =
    input.adapters.createOperationId?.() ??
    `activeRoundPreparation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let releaseLock: (() => Promise<void>) | null = null;

  async function safeFailure(params: {
    errorCode: ActiveRoundPreparationErrorCode;
    roundId: string | null;
    status?: ActiveRoundPreparationStatus;
    message?: string;
  }) {
    const result = failure({
      clubId,
      errorCode: params.errorCode,
      mode: input.mode,
      operationId,
      roundId: params.roundId,
      status: params.status,
      message: params.message
    });

    try {
      await input.adapters.writeReadiness?.(
        clubId,
        readiness({
          operationId,
          roundId: params.roundId,
          status: result.status,
          errorCode: params.errorCode
        })
      );
    } catch {
      // Readiness writes are diagnostic only. They must never change preparation safety.
    }

    return result;
  }

  try {
    const lock = await input.adapters.acquirePreparationLock(clubId, operationId);
    if (lock === "preparing") {
      return safeFailure({
        errorCode: "lock-active",
        roundId: input.expectedPrismaRoundId,
        status: "preparing",
        message: "Realtime sync is already preparing."
      });
    }
    releaseLock = lock;

    const [setupRound, scoreRound] = await Promise.all([
      input.adapters.readActivePrismaRoundSetup(),
      input.adapters.readActivePrismaRoundScores()
    ]);
    if (!setupRound || !scoreRound) {
      return safeFailure({
        errorCode: "no-active-round",
        roundId: null
      });
    }
    if (
      setupRound.id !== input.expectedPrismaRoundId ||
      scoreRound.id !== input.expectedPrismaRoundId ||
      setupRound.id !== scoreRound.id
    ) {
      return safeFailure({
        errorCode: "round-mismatch",
        roundId: setupRound.id
      });
    }
    if (!setupRound.lockedAt && !setupRound.startedAt) {
      return safeFailure({
        errorCode: "round-mismatch",
        roundId: setupRound.id
      });
    }

    const expectedRound = mapPrismaRoundToFirebaseMirror(setupRound);
    const expectedScores = mapPrismaScoresToFirebaseMirror(scoreRound);
    const [firestoreRound, firestoreEntries, firestorePointer, firestoreScores] = await Promise.all([
      input.adapters.readFirestoreRound(clubId, setupRound.id),
      input.adapters.readFirestoreRoundEntries(clubId, setupRound.id),
      input.adapters.readFirestoreActivePointer(clubId),
      input.adapters.readFirestoreScores(clubId, setupRound.id)
    ]);

    validateRoundMirrorInputs({
      round: firestoreRound,
      entries: firestoreEntries,
      pointer: firestorePointer
    });
    validateExistingScores(expectedScores, firestoreScores);

    const roundAudit = auditFirebaseRoundMirror(expectedRound, {
      round: firestoreRound,
      entries: firestoreEntries,
      activePointer: firestorePointer
    });
    const scoreAudit = auditPreparationScores(expectedScores, firestoreScores);

    if (hasExtras(roundAudit) || scoreAudit.counts.extra > 0) {
      return safeFailure({
        errorCode: scoreAudit.counts.extra > 0 ? "extra-score" : "malformed-entry",
        roundId: setupRound.id
      });
    }

    const writableRound = buildWritableRoundInput(expectedRound, roundAudit);
    const createdScoreIds = new Set(scoreAudit.created.map((item) => item.playerId));
    const writeInput: ActiveRoundPreparationWriteInput = {
      ...writableRound,
      scoresToCreate: expectedScores.scores.filter((score) => createdScoreIds.has(score.prismaPlayerId)),
      readiness: readiness({
        operationId,
        roundId: setupRound.id,
        status: "ready"
      })
    };
    const writesPlanned = countWrites(writeInput);

    if (writesPlanned > WRITE_LIMIT) {
      return safeFailure({
        errorCode: "write-limit",
        roundId: setupRound.id
      });
    }

    try {
      const writesApplied = await input.adapters.writePreparationBatch(clubId, setupRound.id, writeInput);
      return {
        ok: true,
        mode: input.mode,
        projectId: IREM_FIREBASE_PROJECT_ID,
        clubId,
        operationId,
        roundId: setupRound.id,
        status: "ready",
        round: roundAudit.round,
        entries: roundAudit.entries,
        activePointer: roundAudit.activePointer,
        scores: scoreAudit,
        writesPlanned,
        writesApplied: writesApplied ?? writesPlanned
      };
    } catch {
      return safeFailure({
        errorCode: "batch-failed",
        roundId: setupRound.id
      });
    }
  } catch (error) {
    return safeFailure({
      errorCode:
        error && typeof error === "object" && "code" in error
          ? (error.code as ActiveRoundPreparationErrorCode)
          : "unknown",
      roundId: input.expectedPrismaRoundId
    });
  } finally {
    if (releaseLock) {
      await releaseLock();
    }
  }
}

export function didRoundTransitionDraftToLive(
  previous: { lockedAt?: Date | string | null; startedAt?: Date | string | null } | null,
  next: { lockedAt?: Date | string | null; startedAt?: Date | string | null }
) {
  return Boolean(previous && !previous.lockedAt && !previous.startedAt && (next.lockedAt || next.startedAt));
}
