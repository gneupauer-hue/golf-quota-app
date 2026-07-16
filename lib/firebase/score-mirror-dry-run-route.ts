import { NextResponse } from "next/server";
import { IREM_FIREBASE_PROJECT_ID } from "@/lib/firebase/player-mirror-seed";
import {
  auditFirebaseScoreMirror,
  mapPrismaScoresToFirebaseMirror,
  type FirestoreScoreMirrorComparisonInput,
  type PrismaScoreMirrorRoundInput
} from "@/lib/firebase/score-mirror";
import type { ClubRole, MembershipStatus } from "@/lib/firebase/types";

export type ScoreMirrorDryRunRequestBody = {
  clubId?: unknown;
  expectedProjectId?: unknown;
  expectedPrismaRoundId?: unknown;
};

export type ScoreMirrorDryRunAuth = {
  uid: string;
};

export type ScoreMirrorDryRunMembership = {
  role?: ClubRole | string;
  status?: MembershipStatus | string;
};

export type ScoreMirrorDryRunRouteAdapters = {
  verifyIdToken: (idToken: string) => Promise<ScoreMirrorDryRunAuth>;
  verifyClub: (clubId: string) => Promise<{ id: string; name?: string | null } | null>;
  readClubMembership: (
    clubId: string,
    uid: string
  ) => Promise<ScoreMirrorDryRunMembership | null>;
  readActivePrismaRoundScores: () => Promise<PrismaScoreMirrorRoundInput | null>;
  readFirestoreScores: (
    clubId: string,
    roundId: string
  ) => Promise<FirestoreScoreMirrorComparisonInput[]>;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    throw Object.assign(new Error("Sign in before running a score mirror dry-run."), {
      status: 401
    });
  }

  return match[1];
}

async function parseRequestBody(request: Request): Promise<ScoreMirrorDryRunRequestBody> {
  try {
    const body = (await request.json()) as unknown;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Request body must be a JSON object.");
    }

    return body as ScoreMirrorDryRunRequestBody;
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 });
  }
}

function validateRequestBody(body: ScoreMirrorDryRunRequestBody) {
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

function assertOwnerOrAdminMembership(membership: ScoreMirrorDryRunMembership | null) {
  if (!membership) {
    throw Object.assign(new Error("You are not a member of this club."), { status: 403 });
  }

  if (membership.status !== "active") {
    throw Object.assign(new Error("Your club membership is not active."), { status: 403 });
  }

  if (membership.role !== "owner" && membership.role !== "admin") {
    throw Object.assign(
      new Error("Only club owners and admins can run score mirror dry-run audits."),
      { status: 403 }
    );
  }
}

function formatAuditItems(items: Array<{ playerId: string; playerName: string | null }>) {
  return items.map((item) => ({
    id: item.playerId,
    name: item.playerName
  }));
}

function dryRunResponse(input: {
  clubId: string;
  activeRound: PrismaScoreMirrorRoundInput | null;
  expectedPrismaRoundId: string | null;
  firestoreScores?: FirestoreScoreMirrorComparisonInput[];
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
      scoringEntryMode: null,
      roundMode: null,
      scores: {
        counts: { created: 0, updated: 0, unchanged: 0, extra: 0 },
        created: [],
        updated: [],
        unchanged: [],
        extra: []
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

  const expected = mapPrismaScoresToFirebaseMirror(input.activeRound);
  const audit = auditFirebaseScoreMirror(expected, input.firestoreScores ?? []);

  return NextResponse.json({
    ok: true,
    mode: "dry-run",
    projectId: IREM_FIREBASE_PROJECT_ID,
    clubId: input.clubId,
    prismaRoundId: expected.roundId,
    firestoreRoundId: expected.roundId,
    status: "active-round",
    scoringEntryMode: expected.scores[0]?.scoringEntryMode ?? input.activeRound.scoringEntryMode,
    roundMode: expected.scores[0]?.roundMode ?? input.activeRound.roundMode,
    scores: {
      counts: audit.counts,
      created: formatAuditItems(audit.created),
      updated: formatAuditItems(audit.updated),
      unchanged: formatAuditItems(audit.unchanged),
      extra: formatAuditItems(audit.extra)
    },
    writesPlanned: 0,
    writesApplied: 0
  });
}

export async function handleScoreMirrorDryRunRequest(
  request: Request,
  adapters: ScoreMirrorDryRunRouteAdapters
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

    const activeRound = await adapters.readActivePrismaRoundScores();

    if (!activeRound || expectedPrismaRoundId !== activeRound.id) {
      return dryRunResponse({ activeRound, clubId, expectedPrismaRoundId });
    }

    mapPrismaScoresToFirebaseMirror(activeRound);
    const firestoreScores = await adapters.readFirestoreScores(clubId, activeRound.id);

    return dryRunResponse({
      activeRound,
      clubId,
      expectedPrismaRoundId,
      firestoreScores
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
      error instanceof Error ? error.message : "Could not run score mirror dry-run audit.",
      status
    );
  }
}
