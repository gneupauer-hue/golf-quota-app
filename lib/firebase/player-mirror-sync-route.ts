import { NextResponse } from "next/server";
import {
  IREM_FIREBASE_PROJECT_ID,
  runPlayerMirrorSeed,
  type PlayerMirrorSeedAdapters,
  type PlayerMirrorSeedResult
} from "@/lib/firebase/player-mirror-seed";
import type { ClubRole, MembershipStatus } from "@/lib/firebase/types";

export type PlayerMirrorSyncRequestBody = {
  clubId?: unknown;
  mode?: unknown;
  expectedProjectId?: unknown;
  expectedPrismaPlayerCount?: unknown;
};

export type PlayerMirrorSyncAuth = {
  uid: string;
};

export type PlayerMirrorSyncMembership = {
  role?: ClubRole | string;
  status?: MembershipStatus | string;
};

export type PlayerMirrorSyncRouteAdapters = PlayerMirrorSeedAdapters & {
  verifyIdToken: (idToken: string) => Promise<PlayerMirrorSyncAuth>;
  readClubMembership: (
    clubId: string,
    uid: string
  ) => Promise<PlayerMirrorSyncMembership | null>;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    throw Object.assign(new Error("Sign in before syncing player mirrors."), { status: 401 });
  }

  return match[1];
}

async function parseRequestBody(request: Request): Promise<PlayerMirrorSyncRequestBody> {
  try {
    const body = (await request.json()) as unknown;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Request body must be a JSON object.");
    }

    return body as PlayerMirrorSyncRequestBody;
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 });
  }
}

function validateRequestBody(body: PlayerMirrorSyncRequestBody) {
  if (typeof body.clubId !== "string" || !body.clubId.trim()) {
    throw Object.assign(new Error("clubId is required."), { status: 400 });
  }

  if (body.mode !== "dry-run") {
    throw Object.assign(new Error('Unsupported mode. Checkpoint 4A only supports "dry-run".'), {
      status: 400
    });
  }

  if (body.expectedProjectId !== IREM_FIREBASE_PROJECT_ID) {
    throw Object.assign(
      new Error(`expectedProjectId must be "${IREM_FIREBASE_PROJECT_ID}".`),
      { status: 400 }
    );
  }

  if (
    typeof body.expectedPrismaPlayerCount !== "number" ||
    !Number.isInteger(body.expectedPrismaPlayerCount) ||
    body.expectedPrismaPlayerCount < 1
  ) {
    throw Object.assign(new Error("expectedPrismaPlayerCount is required."), { status: 400 });
  }

  return {
    clubId: body.clubId,
    expectedPrismaPlayerCount: body.expectedPrismaPlayerCount
  };
}

function assertOwnerMembership(membership: PlayerMirrorSyncMembership | null) {
  if (!membership) {
    throw Object.assign(new Error("You are not a member of this club."), { status: 403 });
  }

  if (membership.status !== "active") {
    throw Object.assign(new Error("Your club membership is not active."), { status: 403 });
  }

  if (membership.role !== "owner") {
    throw Object.assign(new Error("Only the club owner can run player mirror sync audits."), {
      status: 403
    });
  }
}

function syncResponse(result: PlayerMirrorSeedResult) {
  return NextResponse.json({
    ok: true,
    mode: "dry-run",
    projectId: result.projectId,
    clubId: result.clubId,
    counts: {
      prismaPlayers:
        result.audit.counts.created +
        result.audit.counts.updated +
        result.audit.counts.unchanged,
      firestorePlayers:
        result.audit.counts.updated +
        result.audit.counts.unchanged +
        result.audit.counts.extra,
      created: result.audit.counts.created,
      updated: result.audit.counts.updated,
      unchanged: result.audit.counts.unchanged,
      extra: result.audit.counts.extra
    },
    players: result.players,
    writesPlanned: 0,
    writesApplied: 0
  });
}

export async function handlePlayerMirrorSyncRequest(
  request: Request,
  adapters: PlayerMirrorSyncRouteAdapters
) {
  try {
    const body = await parseRequestBody(request);
    const { clubId, expectedPrismaPlayerCount } = validateRequestBody(body);
    const decoded = await adapters.verifyIdToken(getBearerToken(request));
    const club = await adapters.verifyClub(clubId);

    if (!club) {
      return jsonError(`Club "${clubId}" was not found or is not accessible.`, 404);
    }

    assertOwnerMembership(await adapters.readClubMembership(clubId, decoded.uid));

    const result = await runPlayerMirrorSeed(
      {
        clubId,
        confirmProductionWrite: false,
        expectedPrismaPlayerCount,
        expectedProjectId: IREM_FIREBASE_PROJECT_ID,
        projectId: IREM_FIREBASE_PROJECT_ID,
        write: false
      },
      adapters
    );

    return syncResponse(result);
  } catch (error) {
    const status =
      error &&
      typeof error === "object" &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : 500;

    return jsonError(
      error instanceof Error ? error.message : "Could not run player mirror dry-run audit.",
      status
    );
  }
}
