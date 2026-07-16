import { NextResponse } from "next/server";
import { IREM_FIREBASE_PROJECT_ID } from "@/lib/firebase/player-mirror-seed";
import {
  auditFirebaseRoundMirror,
  mapPrismaRoundToFirebaseMirror,
  type FirestoreActiveRoundPointerComparisonInput,
  type FirestoreRoundEntryMirrorComparisonInput,
  type FirestoreRoundMirrorComparisonInput,
  type PrismaRoundMirrorInput,
  type RoundMirrorMappingResult
} from "@/lib/firebase/round-mirror";
import type { ClubRole, MembershipStatus } from "@/lib/firebase/types";

export type RoundMirrorDryRunRequestBody = {
  clubId?: unknown;
  expectedProjectId?: unknown;
  expectedPrismaRoundId?: unknown;
};

export type RoundMirrorDryRunAuth = {
  uid: string;
};

export type RoundMirrorDryRunMembership = {
  role?: ClubRole | string;
  status?: MembershipStatus | string;
};

export type RoundMirrorFirestoreEntryComparison = FirestoreRoundEntryMirrorComparisonInput & {
  playerName?: string | null;
};

export type RoundMirrorDryRunRouteAdapters = {
  verifyIdToken: (idToken: string) => Promise<RoundMirrorDryRunAuth>;
  verifyClub: (clubId: string) => Promise<{ id: string; name?: string | null } | null>;
  readClubMembership: (
    clubId: string,
    uid: string
  ) => Promise<RoundMirrorDryRunMembership | null>;
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
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    throw Object.assign(new Error("Sign in before running a round mirror dry-run."), {
      status: 401
    });
  }

  return match[1];
}

async function parseRequestBody(request: Request): Promise<RoundMirrorDryRunRequestBody> {
  try {
    const body = (await request.json()) as unknown;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Request body must be a JSON object.");
    }

    return body as RoundMirrorDryRunRequestBody;
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 });
  }
}

function validateRequestBody(body: RoundMirrorDryRunRequestBody) {
  if (typeof body.clubId !== "string" || !body.clubId.trim()) {
    throw Object.assign(new Error("clubId is required."), { status: 400 });
  }

  if (body.expectedProjectId !== IREM_FIREBASE_PROJECT_ID) {
    throw Object.assign(
      new Error(`expectedProjectId must be "${IREM_FIREBASE_PROJECT_ID}".`),
      { status: 400 }
    );
  }

  if (body.expectedPrismaRoundId !== null && typeof body.expectedPrismaRoundId !== "string") {
    throw Object.assign(new Error("expectedPrismaRoundId must be a string or null."), {
      status: 400
    });
  }

  return {
    clubId: body.clubId,
    expectedPrismaRoundId: body.expectedPrismaRoundId
  };
}

function assertOwnerOrAdminMembership(membership: RoundMirrorDryRunMembership | null) {
  if (!membership) {
    throw Object.assign(new Error("You are not a member of this club."), { status: 403 });
  }

  if (membership.status !== "active") {
    throw Object.assign(new Error("Your club membership is not active."), { status: 403 });
  }

  if (membership.role !== "owner" && membership.role !== "admin") {
    throw Object.assign(
      new Error("Only club owners and admins can run round mirror dry-run audits."),
      { status: 403 }
    );
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

function dryRunResponse(input: {
  clubId: string;
  activeRound: PrismaRoundMirrorInput | null;
  expectedPrismaRoundId: string | null;
  firestoreRound?: FirestoreRoundMirrorComparisonInput | null;
  firestoreEntries?: RoundMirrorFirestoreEntryComparison[];
  firestoreActivePointer?: FirestoreActiveRoundPointerComparisonInput | null;
}) {
  if (!input.activeRound) {
    if (input.expectedPrismaRoundId !== null) {
      throw Object.assign(
        new Error("expectedPrismaRoundId must be null because no active Prisma round exists."),
        { status: 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      mode: "dry-run",
      projectId: IREM_FIREBASE_PROJECT_ID,
      clubId: input.clubId,
      prismaRoundId: null,
      firestoreRoundId: null,
      status: "no-active-round",
      round: {
        counts: { created: 0, updated: 0, unchanged: 0, extra: 0 },
        createdIds: [],
        updatedIds: [],
        unchangedIds: [],
        extraIds: []
      },
      entries: {
        counts: { created: 0, updated: 0, unchanged: 0, extra: 0 },
        created: [],
        updated: [],
        unchanged: [],
        extra: []
      },
      activePointer: {
        counts: { created: 0, updated: 0, unchanged: 0, extra: 0 },
        createdIds: [],
        updatedIds: [],
        unchangedIds: [],
        extraIds: []
      },
      writesPlanned: 0,
      writesApplied: 0
    });
  }

  if (input.expectedPrismaRoundId !== input.activeRound.id) {
    throw Object.assign(
      new Error(`expectedPrismaRoundId must match active Prisma round "${input.activeRound.id}".`),
      { status: 409 }
    );
  }

  const expected = mapPrismaRoundToFirebaseMirror(input.activeRound);
  const firestoreEntries = input.firestoreEntries ?? [];
  const audit = auditFirebaseRoundMirror(expected, {
    round: input.firestoreRound ?? null,
    entries: firestoreEntries,
    activePointer: input.firestoreActivePointer ?? null
  });
  const nameById = buildNameMap(expected, firestoreEntries);

  return NextResponse.json({
    ok: true,
    mode: "dry-run",
    projectId: IREM_FIREBASE_PROJECT_ID,
    clubId: input.clubId,
    prismaRoundId: expected.round.prismaRoundId,
    firestoreRoundId: expected.roundId,
    status: expected.round.status,
    round: {
      counts: audit.round.counts,
      createdIds: audit.round.createdIds,
      updatedIds: audit.round.updatedIds,
      unchangedIds: audit.round.unchangedIds,
      extraIds: audit.round.extraIds
    },
    entries: {
      counts: audit.entries.counts,
      created: formatIdNames(audit.entries.createdIds, nameById),
      updated: formatIdNames(audit.entries.updatedIds, nameById),
      unchanged: formatIdNames(audit.entries.unchangedIds, nameById),
      extra: formatIdNames(audit.entries.extraIds, nameById)
    },
    activePointer: {
      counts: audit.activePointer.counts,
      createdIds: audit.activePointer.createdIds,
      updatedIds: audit.activePointer.updatedIds,
      unchangedIds: audit.activePointer.unchangedIds,
      extraIds: audit.activePointer.extraIds
    },
    writesPlanned: 0,
    writesApplied: 0
  });
}

export async function handleRoundMirrorDryRunRequest(
  request: Request,
  adapters: RoundMirrorDryRunRouteAdapters
) {
  try {
    const body = await parseRequestBody(request);
    const { clubId, expectedPrismaRoundId } = validateRequestBody(body);
    const decoded = await adapters.verifyIdToken(getBearerToken(request));
    const club = await adapters.verifyClub(clubId);

    if (!club) {
      return jsonError(`Club "${clubId}" was not found or is not accessible.`, 404);
    }

    assertOwnerOrAdminMembership(await adapters.readClubMembership(clubId, decoded.uid));

    const activeRound = await adapters.readActivePrismaRoundSetup();

    if (!activeRound) {
      return dryRunResponse({ activeRound, clubId, expectedPrismaRoundId });
    }

    if (expectedPrismaRoundId !== activeRound.id) {
      return dryRunResponse({ activeRound, clubId, expectedPrismaRoundId });
    }

    const [firestoreRound, firestoreEntries, firestoreActivePointer] = await Promise.all([
      adapters.readFirestoreRound(clubId, activeRound.id),
      adapters.readFirestoreRoundEntries(clubId, activeRound.id),
      adapters.readFirestoreActivePointer(clubId)
    ]);

    return dryRunResponse({
      activeRound,
      clubId,
      expectedPrismaRoundId,
      firestoreRound,
      firestoreEntries,
      firestoreActivePointer
    });
  } catch (error) {
    const status =
      error &&
      typeof error === "object" &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : 500;

    return jsonError(
      error instanceof Error ? error.message : "Could not run round mirror dry-run audit.",
      status
    );
  }
}
