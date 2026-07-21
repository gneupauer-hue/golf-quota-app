import { NextResponse } from "next/server";
import { IREM_FIREBASE_PROJECT_ID } from "@/lib/firebase/player-mirror-seed";
import {
  auditFirebaseScoreMirror,
  mapPrismaScoresToFirebaseMirror,
  type FirestoreScoreMirrorComparisonInput,
  type PrismaScoreMirrorRoundInput,
  type ScoreMirrorAuditResult,
  type ScoreMirrorMappingResult
} from "@/lib/firebase/score-mirror";
import type { ClubRole, FirebaseScoreMirror, MembershipStatus } from "@/lib/firebase/types";

export type ScoreMirrorPublishRequestBody = {
  clubId?: unknown;
  confirmPublish?: unknown;
  expectedProjectId?: unknown;
  expectedPrismaRoundId?: unknown;
};

export type ScoreMirrorPublishAuth = {
  uid: string;
};

export type ScoreMirrorPublishMembership = {
  role?: ClubRole | string;
  status?: MembershipStatus | string;
};

export type ScoreMirrorFirestoreComparison = FirestoreScoreMirrorComparisonInput & {
  prismaEntryId?: string;
  source?: unknown;
  scoreVersion?: unknown;
  lastOperationId?: unknown;
  lastEditedByUid?: unknown;
  lastClientRequestId?: unknown;
};

export type ScoreMirrorPublishWriteInput = {
  scores: FirebaseScoreMirror[];
  operationId: string;
};

export type ScoreMirrorPublishRouteAdapters = {
  verifyIdToken: (idToken: string) => Promise<ScoreMirrorPublishAuth>;
  verifyClub: (clubId: string) => Promise<{ id: string; name?: string | null } | null>;
  readClubMembership: (
    clubId: string,
    uid: string
  ) => Promise<ScoreMirrorPublishMembership | null>;
  readActivePrismaRoundScores: () => Promise<PrismaScoreMirrorRoundInput | null>;
  readFirestoreScores: (
    clubId: string,
    roundId: string
  ) => Promise<ScoreMirrorFirestoreComparison[]>;
  acquireScoreMirrorPublishLock: (
    clubId: string,
    uid: string,
    operationId: string
  ) => Promise<() => Promise<void>>;
  writeScoreMirror: (
    clubId: string,
    roundId: string,
    input: ScoreMirrorPublishWriteInput
  ) => Promise<number | void>;
  createOperationId?: () => string;
};

function jsonError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    throw Object.assign(new Error("Sign in before publishing score mirrors."), { status: 401 });
  }

  return match[1];
}

async function parseRequestBody(request: Request): Promise<ScoreMirrorPublishRequestBody> {
  try {
    const body = (await request.json()) as unknown;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Request body must be a JSON object.");
    }

    return body as ScoreMirrorPublishRequestBody;
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 });
  }
}

function validateRequestBody(body: ScoreMirrorPublishRequestBody) {
  if (typeof body.clubId !== "string" || !body.clubId.trim()) {
    throw Object.assign(new Error("clubId is required."), { status: 400 });
  }

  if (body.expectedProjectId !== IREM_FIREBASE_PROJECT_ID) {
    throw Object.assign(
      new Error(`expectedProjectId must be "${IREM_FIREBASE_PROJECT_ID}".`),
      { status: 400 }
    );
  }

  if (typeof body.expectedPrismaRoundId !== "string" || !body.expectedPrismaRoundId.trim()) {
    throw Object.assign(new Error("expectedPrismaRoundId is required."), { status: 400 });
  }

  if (body.confirmPublish !== true) {
    throw Object.assign(new Error("Publish requires confirmPublish: true."), { status: 400 });
  }

  return {
    clubId: body.clubId,
    expectedPrismaRoundId: body.expectedPrismaRoundId
  };
}

function assertOwnerOrAdminMembership(membership: ScoreMirrorPublishMembership | null) {
  if (!membership) {
    throw Object.assign(new Error("You are not a member of this club."), { status: 403 });
  }

  if (membership.status !== "active") {
    throw Object.assign(new Error("Your club membership is not active."), { status: 403 });
  }

  if (membership.role !== "owner" && membership.role !== "admin") {
    throw Object.assign(new Error("Only club owners and admins can publish score mirrors."), {
      status: 403
    });
  }
}

function formatAuditItems(items: Array<{ playerId: string; playerName: string | null }>) {
  return items.map((item) => ({
    id: item.playerId,
    name: item.playerName
  }));
}

function assertValidFirestoreScores(scores: ScoreMirrorFirestoreComparison[]) {
  const seen = new Set<string>();

  for (const score of scores) {
    if (typeof score.prismaPlayerId !== "string" || !score.prismaPlayerId.trim()) {
      throw new Error("Malformed Firestore score mirror document: missing prismaPlayerId.");
    }

    if (typeof score.checksum !== "string" || !score.checksum.trim()) {
      throw new Error(
        `Malformed Firestore score mirror document for "${score.prismaPlayerId}": missing checksum.`
      );
    }

    if (score.docId && score.docId !== score.prismaPlayerId) {
      throw new Error(
        `Malformed Firestore score mirror document "${score.docId}": document ID must match prismaPlayerId "${score.prismaPlayerId}".`
      );
    }

    if (score.prismaEntryId !== undefined && typeof score.prismaEntryId !== "string") {
      throw new Error(
        `Malformed Firestore score mirror document for "${score.prismaPlayerId}": invalid prismaEntryId.`
      );
    }

    if (seen.has(score.prismaPlayerId)) {
      throw new Error(`Duplicate Firestore score mirror ID detected: ${score.prismaPlayerId}.`);
    }

    seen.add(score.prismaPlayerId);
  }
}

function assertFirestoreScoreIdsMatchExpected(
  expected: ScoreMirrorMappingResult,
  firestoreScores: ScoreMirrorFirestoreComparison[]
) {
  const expectedByPlayerId = new Map(
    expected.scores.map((score) => [score.prismaPlayerId, score])
  );

  for (const firestoreScore of firestoreScores) {
    const expectedScore = expectedByPlayerId.get(firestoreScore.prismaPlayerId ?? "");
    if (!expectedScore) {
      continue;
    }

    if (firestoreScore.prismaEntryId && firestoreScore.prismaEntryId !== expectedScore.prismaEntryId) {
      throw new Error(
        `Firestore score mirror for "${firestoreScore.prismaPlayerId}" has mismatched Prisma entry ID.`
      );
    }
  }
}

function hasGranularScoreOperationState(score: ScoreMirrorFirestoreComparison) {
  return (
    score.source === "firestore-test" ||
    typeof score.lastOperationId === "string" ||
    typeof score.lastEditedByUid === "string" ||
    typeof score.lastClientRequestId === "string" ||
    (typeof score.scoreVersion === "number" && score.scoreVersion > 1)
  );
}

function assertNoGranularScoreOperationState(scores: ScoreMirrorFirestoreComparison[]) {
  const protectedScore = scores.find(hasGranularScoreOperationState);

  if (protectedScore) {
    throw Object.assign(
      new Error(
        "Score mirror contains granular score-write history. Use active round preparation repair instead of legacy score publish."
      ),
      { status: 409 }
    );
  }
}

function buildWritableScores(expected: ScoreMirrorMappingResult, audit: ScoreMirrorAuditResult) {
  const writableIds = new Set([
    ...audit.created.map((item) => item.playerId),
    ...audit.updated.map((item) => item.playerId)
  ]);

  return expected.scores.filter((score) => writableIds.has(score.prismaPlayerId));
}

function buildResponse(input: {
  audit: ScoreMirrorAuditResult;
  clubId: string;
  expected: ScoreMirrorMappingResult;
  operationId: string;
  statusCode?: number;
  writeError?: string;
  writesApplied: number;
  writesPlanned: number;
}) {
  return NextResponse.json(
    {
      ok: !input.writeError,
      mode: "publish",
      projectId: IREM_FIREBASE_PROJECT_ID,
      clubId: input.clubId,
      prismaRoundId: input.expected.roundId,
      firestoreRoundId: input.expected.roundId,
      publishedRoundId: input.expected.roundId,
      status: input.writeError ? "publish-failed" : "published",
      scoringEntryMode: input.expected.scores[0]?.scoringEntryMode ?? null,
      roundMode: input.expected.scores[0]?.roundMode ?? null,
      scores: {
        counts: input.audit.counts,
        created: formatAuditItems(input.audit.created),
        updated: formatAuditItems(input.audit.updated),
        unchanged: formatAuditItems(input.audit.unchanged),
        extra: formatAuditItems(input.audit.extra)
      },
      writesPlanned: input.writesPlanned,
      writesApplied: input.writesApplied,
      operationId: input.operationId,
      ...(input.writeError ? { error: input.writeError } : {})
    },
    { status: input.statusCode ?? (input.writeError ? 500 : 200) }
  );
}

export async function handleScoreMirrorPublishRequest(
  request: Request,
  adapters: ScoreMirrorPublishRouteAdapters
) {
  let releaseLock: (() => Promise<void>) | null = null;
  const operationId =
    adapters.createOperationId?.() ??
    `scoreMirror-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  try {
    const body = await parseRequestBody(request);
    const { clubId, expectedPrismaRoundId } = validateRequestBody(body);
    const decoded = await adapters.verifyIdToken(getBearerToken(request));
    const club = await adapters.verifyClub(clubId);

    if (!club) {
      return jsonError(`Club "${clubId}" was not found or is not accessible.`, 404);
    }

    assertOwnerOrAdminMembership(await adapters.readClubMembership(clubId, decoded.uid));

    releaseLock = await adapters.acquireScoreMirrorPublishLock(clubId, decoded.uid, operationId);

    const activeRound = await adapters.readActivePrismaRoundScores();

    if (!activeRound) {
      return jsonError("Cannot publish score mirror because no active Prisma round exists.", 409, {
        operationId,
        writesPlanned: 0,
        writesApplied: 0
      });
    }

    if (expectedPrismaRoundId !== activeRound.id) {
      return jsonError(
        `expectedPrismaRoundId must match active Prisma round "${activeRound.id}".`,
        409,
        { operationId, writesPlanned: 0, writesApplied: 0 }
      );
    }

    const expected = mapPrismaScoresToFirebaseMirror(activeRound);
    const firestoreScores = await adapters.readFirestoreScores(clubId, activeRound.id);

    assertValidFirestoreScores(firestoreScores);
    assertFirestoreScoreIdsMatchExpected(expected, firestoreScores);
    assertNoGranularScoreOperationState(firestoreScores);

    const audit = auditFirebaseScoreMirror(expected, firestoreScores);

    if (audit.counts.extra > 0) {
      return buildResponse({
        audit,
        clubId,
        expected,
        operationId,
        statusCode: 409,
        writeError: "Refusing to publish while extra Firestore score mirror documents exist.",
        writesPlanned: 0,
        writesApplied: 0
      });
    }

    const writableScores = buildWritableScores(expected, audit);
    const writesPlanned = writableScores.length;

    if (writesPlanned === 0) {
      return buildResponse({
        audit,
        clubId,
        expected,
        operationId,
        writesPlanned: 0,
        writesApplied: 0
      });
    }

    try {
      const writesApplied = await adapters.writeScoreMirror(clubId, expected.roundId, {
        scores: writableScores,
        operationId
      });

      return buildResponse({
        audit,
        clubId,
        expected,
        operationId,
        writesPlanned,
        writesApplied: writesApplied ?? writesPlanned
      });
    } catch (error) {
      return buildResponse({
        audit,
        clubId,
        expected,
        operationId,
        writeError: error instanceof Error ? error.message : "Could not publish score mirror.",
        writesPlanned,
        writesApplied: 0
      });
    }
  } catch (error) {
    const status =
      error &&
      typeof error === "object" &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : 500;

    return jsonError(
      error instanceof Error ? error.message : "Could not publish score mirror.",
      status,
      { operationId }
    );
  } finally {
    if (releaseLock) {
      await releaseLock();
    }
  }
}
