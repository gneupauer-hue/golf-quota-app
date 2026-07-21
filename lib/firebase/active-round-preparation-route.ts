import { NextResponse } from "next/server";
import { IREM_FIREBASE_PROJECT_ID } from "@/lib/firebase/player-mirror-seed";
import type { ClubRole, MembershipStatus } from "@/lib/firebase/types";
import {
  IREM_FIREBASE_CLUB_ID,
  prepareActiveRoundFirestoreMirror,
  type ActiveRoundPreparationAdapters
} from "@/lib/firebase/active-round-preparation";

export type ActiveRoundPreparationRepairAuth = {
  uid: string;
};

export type ActiveRoundPreparationRepairMembership = {
  role?: ClubRole | string;
  status?: MembershipStatus | string;
};

export type ActiveRoundPreparationRepairAdapters = ActiveRoundPreparationAdapters & {
  verifyIdToken: (idToken: string) => Promise<ActiveRoundPreparationRepairAuth>;
  verifyClub: (clubId: string) => Promise<{ id: string; name?: string | null } | null>;
  readClubMembership: (
    clubId: string,
    uid: string
  ) => Promise<ActiveRoundPreparationRepairMembership | null>;
};

function jsonError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    throw Object.assign(new Error("Sign in before repairing round preparation."), { status: 401 });
  }

  return match[1];
}

function assertOwnerOrAdminMembership(membership: ActiveRoundPreparationRepairMembership | null) {
  if (!membership) {
    throw Object.assign(new Error("You are not a member of this club."), { status: 403 });
  }
  if (membership.status !== "active") {
    throw Object.assign(new Error("Your club membership is not active."), { status: 403 });
  }
  if (membership.role !== "owner" && membership.role !== "admin") {
    throw Object.assign(new Error("Only club owners and admins can repair round preparation."), {
      status: 403
    });
  }
}

async function parseRequestBody(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Request body must be a JSON object.");
    }
    return body as { clubId?: unknown; expectedProjectId?: unknown };
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 });
  }
}

export async function handleActiveRoundPreparationRepairRequest(
  request: Request,
  adapters: ActiveRoundPreparationRepairAdapters
) {
  try {
    const body = await parseRequestBody(request);
    if (body.clubId !== IREM_FIREBASE_CLUB_ID) {
      return jsonError(`clubId must be "${IREM_FIREBASE_CLUB_ID}".`, 400);
    }
    if (body.expectedProjectId !== IREM_FIREBASE_PROJECT_ID) {
      return jsonError(`expectedProjectId must be "${IREM_FIREBASE_PROJECT_ID}".`, 400);
    }

    const decoded = await adapters.verifyIdToken(getBearerToken(request));
    const club = await adapters.verifyClub(IREM_FIREBASE_CLUB_ID);
    if (!club) {
      return jsonError(`Club "${IREM_FIREBASE_CLUB_ID}" was not found or is not accessible.`, 404);
    }
    assertOwnerOrAdminMembership(
      await adapters.readClubMembership(IREM_FIREBASE_CLUB_ID, decoded.uid)
    );

    const activeRound = await adapters.readActivePrismaRoundSetup();
    if (!activeRound) {
      return jsonError("No active Prisma round is available to repair.", 409, {
        writesPlanned: 0,
        writesApplied: 0
      });
    }

    const result = await prepareActiveRoundFirestoreMirror({
      adapters,
      clubId: IREM_FIREBASE_CLUB_ID,
      expectedPrismaRoundId: activeRound.id,
      mode: "repair"
    });

    return NextResponse.json(result, { status: result.ok ? 200 : result.status === "preparing" ? 202 : 409 });
  } catch (error) {
    const status =
      error &&
      typeof error === "object" &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : 500;

    return jsonError(
      error instanceof Error ? error.message : "Could not repair round preparation.",
      status
    );
  }
}
