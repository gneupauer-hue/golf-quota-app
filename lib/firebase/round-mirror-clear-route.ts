import { NextResponse } from "next/server";
import { IREM_FIREBASE_PROJECT_ID } from "@/lib/firebase/player-mirror-seed";
import type { ClubRole, MembershipStatus } from "@/lib/firebase/types";

export type RoundMirrorClearRequestBody = {
  clubId?: unknown;
  confirmClear?: unknown;
  expectedFirestoreRoundId?: unknown;
  expectedProjectId?: unknown;
};

export type RoundMirrorClearAuth = {
  uid: string;
};

export type RoundMirrorClearMembership = {
  role?: ClubRole | string;
  status?: MembershipStatus | string;
};

export type FirestoreRoundMirrorClearInput = {
  docId: string;
  prismaRoundId?: string;
  isTestRound?: boolean;
};

export type FirestoreActiveRoundPointerClearInput = {
  roundId?: string;
  prismaRoundId?: string;
};

export type RoundMirrorClearResult = {
  entriesDeleted: number;
  pointerCleared: boolean;
  roundDeleted: boolean;
  writesApplied: number;
};

export type RoundMirrorClearRouteAdapters = {
  verifyIdToken: (idToken: string) => Promise<RoundMirrorClearAuth>;
  verifyClub: (clubId: string) => Promise<{ id: string; name?: string | null } | null>;
  readClubMembership: (
    clubId: string,
    uid: string
  ) => Promise<RoundMirrorClearMembership | null>;
  readActivePrismaRoundId: () => Promise<string | null>;
  readFirestoreRound: (
    clubId: string,
    roundId: string
  ) => Promise<FirestoreRoundMirrorClearInput | null>;
  readFirestoreActivePointer: (
    clubId: string
  ) => Promise<FirestoreActiveRoundPointerClearInput | null>;
  acquireRoundMirrorClearLock: (clubId: string, uid: string) => Promise<() => Promise<void>>;
  clearRoundMirror: (clubId: string, roundId: string) => Promise<RoundMirrorClearResult>;
};

function jsonError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    throw Object.assign(new Error("Sign in before clearing round mirrors."), { status: 401 });
  }

  return match[1];
}

async function parseRequestBody(request: Request): Promise<RoundMirrorClearRequestBody> {
  try {
    const body = (await request.json()) as unknown;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Request body must be a JSON object.");
    }

    return body as RoundMirrorClearRequestBody;
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 });
  }
}

function validateRequestBody(body: RoundMirrorClearRequestBody) {
  if (typeof body.clubId !== "string" || !body.clubId.trim()) {
    throw Object.assign(new Error("clubId is required."), { status: 400 });
  }

  if (body.expectedProjectId !== IREM_FIREBASE_PROJECT_ID) {
    throw Object.assign(
      new Error(`expectedProjectId must be "${IREM_FIREBASE_PROJECT_ID}".`),
      { status: 400 }
    );
  }

  if (
    typeof body.expectedFirestoreRoundId !== "string" ||
    !body.expectedFirestoreRoundId.trim()
  ) {
    throw Object.assign(new Error("expectedFirestoreRoundId is required."), { status: 400 });
  }

  if (body.confirmClear !== true) {
    throw Object.assign(new Error("Clear requires confirmClear: true."), { status: 400 });
  }

  return {
    clubId: body.clubId,
    expectedFirestoreRoundId: body.expectedFirestoreRoundId
  };
}

function assertOwnerOrAdminMembership(membership: RoundMirrorClearMembership | null) {
  if (!membership) {
    throw Object.assign(new Error("You are not a member of this club."), { status: 403 });
  }

  if (membership.status !== "active") {
    throw Object.assign(new Error("Your club membership is not active."), { status: 403 });
  }

  if (membership.role !== "owner" && membership.role !== "admin") {
    throw Object.assign(new Error("Only club owners and admins can clear round mirrors."), {
      status: 403
    });
  }
}

function assertRoundCanBeCleared(input: {
  activePointer: FirestoreActiveRoundPointerClearInput | null;
  activePrismaRoundId: string | null;
  expectedFirestoreRoundId: string;
  round: FirestoreRoundMirrorClearInput | null;
}) {
  const { activePointer, activePrismaRoundId, expectedFirestoreRoundId, round } = input;

  if (!round) {
    throw Object.assign(
      new Error(`Firestore round mirror "${expectedFirestoreRoundId}" was not found.`),
      { status: 404 }
    );
  }

  if (round.docId !== expectedFirestoreRoundId) {
    throw Object.assign(new Error("Firestore round document ID does not match expected ID."), {
      status: 409
    });
  }

  if (round.prismaRoundId && round.prismaRoundId !== expectedFirestoreRoundId) {
    throw Object.assign(new Error("Firestore round mirror has a mismatched Prisma round ID."), {
      status: 409
    });
  }

  if (round.isTestRound !== true) {
    throw Object.assign(new Error("Only mirrored test rounds can be cleared."), {
      status: 409
    });
  }

  if (!activePointer?.roundId) {
    throw Object.assign(new Error("Active-round pointer is missing or malformed."), {
      status: 409
    });
  }

  if (activePointer.roundId !== expectedFirestoreRoundId) {
    throw Object.assign(new Error("Active-round pointer does not match expected round ID."), {
      status: 409
    });
  }

  if (activePointer.prismaRoundId && activePointer.prismaRoundId !== expectedFirestoreRoundId) {
    throw Object.assign(new Error("Active-round pointer has a mismatched Prisma round ID."), {
      status: 409
    });
  }

  if (activePrismaRoundId === expectedFirestoreRoundId) {
    throw Object.assign(
      new Error("Cannot clear the Firestore mirror while the matching Prisma round is still active."),
      { status: 409 }
    );
  }
}

export async function handleRoundMirrorClearRequest(
  request: Request,
  adapters: RoundMirrorClearRouteAdapters
) {
  let releaseLock: (() => Promise<void>) | null = null;

  try {
    const body = await parseRequestBody(request);
    const { clubId, expectedFirestoreRoundId } = validateRequestBody(body);
    const decoded = await adapters.verifyIdToken(getBearerToken(request));
    const club = await adapters.verifyClub(clubId);

    if (!club) {
      return jsonError(`Club "${clubId}" was not found or is not accessible.`, 404);
    }

    assertOwnerOrAdminMembership(await adapters.readClubMembership(clubId, decoded.uid));

    releaseLock = await adapters.acquireRoundMirrorClearLock(clubId, decoded.uid);

    const [round, activePointer, activePrismaRoundId] = await Promise.all([
      adapters.readFirestoreRound(clubId, expectedFirestoreRoundId),
      adapters.readFirestoreActivePointer(clubId),
      adapters.readActivePrismaRoundId()
    ]);

    assertRoundCanBeCleared({
      activePointer,
      activePrismaRoundId,
      expectedFirestoreRoundId,
      round
    });

    try {
      const result = await adapters.clearRoundMirror(clubId, expectedFirestoreRoundId);

      return NextResponse.json({
        ok: true,
        mode: "clear",
        projectId: IREM_FIREBASE_PROJECT_ID,
        clubId,
        clearedRoundId: expectedFirestoreRoundId,
        entriesDeleted: result.entriesDeleted,
        roundDeleted: result.roundDeleted,
        pointerCleared: result.pointerCleared,
        writesApplied: result.writesApplied
      });
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "Could not clear round mirror.",
        500,
        {
          clearedRoundId: expectedFirestoreRoundId,
          entriesDeleted: 0,
          roundDeleted: false,
          pointerCleared: false,
          writesApplied: 0
        }
      );
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
      error instanceof Error ? error.message : "Could not clear round mirror.",
      status
    );
  } finally {
    if (releaseLock) {
      await releaseLock();
    }
  }
}
