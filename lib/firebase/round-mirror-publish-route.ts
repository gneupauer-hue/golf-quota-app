import { NextResponse } from "next/server";
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
import type {
  ClubRole,
  FirebaseActiveRoundPointerMirror,
  FirebaseRoundEntryMirror,
  FirebaseRoundMirror,
  MembershipStatus
} from "@/lib/firebase/types";

export type RoundMirrorPublishRequestBody = {
  clubId?: unknown;
  confirmPublish?: unknown;
  expectedProjectId?: unknown;
  expectedPrismaRoundId?: unknown;
};

export type RoundMirrorPublishAuth = {
  uid: string;
};

export type RoundMirrorPublishMembership = {
  role?: ClubRole | string;
  status?: MembershipStatus | string;
};

export type RoundMirrorFirestoreEntryComparison = FirestoreRoundEntryMirrorComparisonInput & {
  playerName?: string | null;
};

export type RoundMirrorPublishWriteInput = {
  round?: FirebaseRoundMirror;
  entries: FirebaseRoundEntryMirror[];
  activePointer?: FirebaseActiveRoundPointerMirror;
};

export type RoundMirrorPublishRouteAdapters = {
  verifyIdToken: (idToken: string) => Promise<RoundMirrorPublishAuth>;
  verifyClub: (clubId: string) => Promise<{ id: string; name?: string | null } | null>;
  readClubMembership: (
    clubId: string,
    uid: string
  ) => Promise<RoundMirrorPublishMembership | null>;
  readActivePrismaRoundSetup: () => Promise<PrismaRoundMirrorInput | null>;
  readFirestoreRound: (
    clubId: string,
    roundId: string
  ) => Promise<FirestoreRoundMirrorComparisonInput | null>;
  readFirestoreRoundEntries: (
    clubId: string,
    roundId: string
  ) => Promise<RoundMirrorFirestoreEntryComparison[]>;
  readFirestoreActivePointer: (
    clubId: string
  ) => Promise<FirestoreActiveRoundPointerComparisonInput | null>;
  acquireRoundMirrorPublishLock: (clubId: string, uid: string) => Promise<() => Promise<void>>;
  writeRoundMirror: (
    clubId: string,
    roundId: string,
    input: RoundMirrorPublishWriteInput
  ) => Promise<number | void>;
};

function jsonError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    throw Object.assign(new Error("Sign in before publishing round mirrors."), { status: 401 });
  }

  return match[1];
}

async function parseRequestBody(request: Request): Promise<RoundMirrorPublishRequestBody> {
  try {
    const body = (await request.json()) as unknown;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Request body must be a JSON object.");
    }

    return body as RoundMirrorPublishRequestBody;
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 });
  }
}

function validateRequestBody(body: RoundMirrorPublishRequestBody) {
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

function assertOwnerOrAdminMembership(membership: RoundMirrorPublishMembership | null) {
  if (!membership) {
    throw Object.assign(new Error("You are not a member of this club."), { status: 403 });
  }

  if (membership.status !== "active") {
    throw Object.assign(new Error("Your club membership is not active."), { status: 403 });
  }

  if (membership.role !== "owner" && membership.role !== "admin") {
    throw Object.assign(new Error("Only club owners and admins can publish round mirrors."), {
      status: 403
    });
  }
}

function formatIdNames(ids: string[], nameById: Map<string, string | null>) {
  return ids.map((id) => ({
    id,
    name: nameById.get(id) ?? null
  }));
}

function buildNameMap(
  expected: RoundMirrorMappingResult,
  firestoreEntries: RoundMirrorFirestoreEntryComparison[]
) {
  const map = new Map<string, string | null>();

  for (const entry of expected.entries) {
    map.set(entry.prismaPlayerId, entry.playerName);
  }

  for (const entry of firestoreEntries) {
    if (entry.prismaPlayerId && !map.has(entry.prismaPlayerId)) {
      map.set(entry.prismaPlayerId, entry.playerName ?? null);
    }
  }

  return map;
}

function assertValidFirestoreRound(round: FirestoreRoundMirrorComparisonInput | null) {
  if (!round) return;

  if (typeof round.checksum !== "string" || !round.checksum.trim()) {
    throw new Error("Malformed Firestore round mirror document: missing checksum.");
  }
}

function assertValidFirestoreEntries(entries: RoundMirrorFirestoreEntryComparison[]) {
  const seen = new Set<string>();

  for (const entry of entries) {
    if (typeof entry.prismaPlayerId !== "string" || !entry.prismaPlayerId.trim()) {
      throw new Error("Malformed Firestore round entry mirror document: missing prismaPlayerId.");
    }

    if (typeof entry.checksum !== "string" || !entry.checksum.trim()) {
      throw new Error(
        `Malformed Firestore round entry mirror document for "${entry.prismaPlayerId}": missing checksum.`
      );
    }

    if (entry.docId && entry.docId !== entry.prismaPlayerId) {
      throw new Error(
        `Malformed Firestore round entry mirror document "${entry.docId}": document ID must match prismaPlayerId "${entry.prismaPlayerId}".`
      );
    }

    if (seen.has(entry.prismaPlayerId)) {
      throw new Error(`Duplicate Firestore round entry mirror ID detected: ${entry.prismaPlayerId}.`);
    }

    seen.add(entry.prismaPlayerId);
  }
}

function assertValidFirestoreActivePointer(
  pointer: FirestoreActiveRoundPointerComparisonInput | null
) {
  if (!pointer) return;

  if (typeof pointer.roundId !== "string" || !pointer.roundId.trim()) {
    throw new Error("Malformed Firestore active-round pointer: missing roundId.");
  }

  if (typeof pointer.prismaRoundId !== "string" || !pointer.prismaRoundId.trim()) {
    throw new Error("Malformed Firestore active-round pointer: missing prismaRoundId.");
  }

  if (pointer.prismaRoundId !== pointer.roundId) {
    throw new Error("Malformed Firestore active-round pointer: mismatched round IDs.");
  }

  if (typeof pointer.checksum !== "string" || !pointer.checksum.trim()) {
    throw new Error("Malformed Firestore active-round pointer: missing checksum.");
  }
}

function buildWritableMirrorInput(
  expected: RoundMirrorMappingResult,
  audit: RoundMirrorAuditResult
): RoundMirrorPublishWriteInput {
  const writableEntryIds = new Set([...audit.entries.createdIds, ...audit.entries.updatedIds]);
  const shouldWriteRound = audit.round.counts.created > 0 || audit.round.counts.updated > 0;
  const shouldWritePointer =
    audit.activePointer.counts.created > 0 || audit.activePointer.counts.updated > 0;

  return {
    round: shouldWriteRound ? expected.round : undefined,
    entries: expected.entries.filter((entry) => writableEntryIds.has(entry.prismaPlayerId)),
    activePointer: shouldWritePointer ? expected.activePointer : undefined
  };
}

function countWrites(input: RoundMirrorPublishWriteInput) {
  return (input.round ? 1 : 0) + input.entries.length + (input.activePointer ? 1 : 0);
}

function buildResponse(input: {
  audit: RoundMirrorAuditResult;
  clubId: string;
  expected: RoundMirrorMappingResult;
  firestoreEntries: RoundMirrorFirestoreEntryComparison[];
  statusCode?: number;
  writeError?: string;
  writesApplied: number;
  writesPlanned: number;
}) {
  const nameById = buildNameMap(input.expected, input.firestoreEntries);

  return NextResponse.json(
    {
      ok: !input.writeError,
      mode: "publish",
      projectId: IREM_FIREBASE_PROJECT_ID,
      clubId: input.clubId,
      prismaRoundId: input.expected.round.prismaRoundId,
      firestoreRoundId: input.expected.roundId,
      publishedRoundId: input.expected.roundId,
      status: input.writeError ? "publish-failed" : input.expected.round.status,
      round: {
        counts: input.audit.round.counts,
        createdIds: input.audit.round.createdIds,
        updatedIds: input.audit.round.updatedIds,
        unchangedIds: input.audit.round.unchangedIds,
        extraIds: input.audit.round.extraIds
      },
      entries: {
        counts: input.audit.entries.counts,
        created: formatIdNames(input.audit.entries.createdIds, nameById),
        updated: formatIdNames(input.audit.entries.updatedIds, nameById),
        unchanged: formatIdNames(input.audit.entries.unchangedIds, nameById),
        extra: formatIdNames(input.audit.entries.extraIds, nameById)
      },
      activePointer: {
        counts: input.audit.activePointer.counts,
        createdIds: input.audit.activePointer.createdIds,
        updatedIds: input.audit.activePointer.updatedIds,
        unchangedIds: input.audit.activePointer.unchangedIds,
        extraIds: input.audit.activePointer.extraIds
      },
      writesPlanned: input.writesPlanned,
      writesApplied: input.writesApplied,
      ...(input.writeError ? { error: input.writeError } : {})
    },
    { status: input.statusCode ?? (input.writeError ? 500 : 200) }
  );
}

function hasExtras(audit: RoundMirrorAuditResult) {
  return (
    audit.round.counts.extra > 0 ||
    audit.entries.counts.extra > 0 ||
    audit.activePointer.counts.extra > 0
  );
}

export async function handleRoundMirrorPublishRequest(
  request: Request,
  adapters: RoundMirrorPublishRouteAdapters
) {
  let releaseLock: (() => Promise<void>) | null = null;

  try {
    const body = await parseRequestBody(request);
    const { clubId, expectedPrismaRoundId } = validateRequestBody(body);
    const decoded = await adapters.verifyIdToken(getBearerToken(request));
    const club = await adapters.verifyClub(clubId);

    if (!club) {
      return jsonError(`Club "${clubId}" was not found or is not accessible.`, 404);
    }

    assertOwnerOrAdminMembership(await adapters.readClubMembership(clubId, decoded.uid));

    releaseLock = await adapters.acquireRoundMirrorPublishLock(clubId, decoded.uid);

    const activeRound = await adapters.readActivePrismaRoundSetup();

    if (!activeRound) {
      return jsonError("Cannot publish round mirror because no active Prisma round exists.", 409, {
        writesPlanned: 0,
        writesApplied: 0
      });
    }

    if (expectedPrismaRoundId !== activeRound.id) {
      return jsonError(
        `expectedPrismaRoundId must match active Prisma round "${activeRound.id}".`,
        409,
        { writesPlanned: 0, writesApplied: 0 }
      );
    }

    const expected = mapPrismaRoundToFirebaseMirror(activeRound);
    const [firestoreRound, firestoreEntries, firestoreActivePointer] = await Promise.all([
      adapters.readFirestoreRound(clubId, activeRound.id),
      adapters.readFirestoreRoundEntries(clubId, activeRound.id),
      adapters.readFirestoreActivePointer(clubId)
    ]);

    assertValidFirestoreRound(firestoreRound);
    assertValidFirestoreEntries(firestoreEntries);
    assertValidFirestoreActivePointer(firestoreActivePointer);

    const audit = auditFirebaseRoundMirror(expected, {
      round: firestoreRound,
      entries: firestoreEntries,
      activePointer: firestoreActivePointer
    });

    if (hasExtras(audit)) {
      return buildResponse({
        audit,
        clubId,
        expected,
        firestoreEntries,
        statusCode: 409,
        writeError: "Refusing to publish while extra Firestore round mirror documents exist.",
        writesPlanned: 0,
        writesApplied: 0
      });
    }

    const writable = buildWritableMirrorInput(expected, audit);
    const writesPlanned = countWrites(writable);

    if (writesPlanned === 0) {
      return buildResponse({
        audit,
        clubId,
        expected,
        firestoreEntries,
        writesPlanned: 0,
        writesApplied: 0
      });
    }

    try {
      const writesApplied = await adapters.writeRoundMirror(clubId, expected.roundId, writable);

      return buildResponse({
        audit,
        clubId,
        expected,
        firestoreEntries,
        writesPlanned,
        writesApplied: writesApplied ?? writesPlanned
      });
    } catch (error) {
      return buildResponse({
        audit,
        clubId,
        expected,
        firestoreEntries,
        writeError: error instanceof Error ? error.message : "Could not publish round mirror.",
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
      error instanceof Error ? error.message : "Could not publish round mirror.",
      status
    );
  } finally {
    if (releaseLock) {
      await releaseLock();
    }
  }
}
