import { NextResponse } from "next/server";
import { IREM_FIREBASE_PROJECT_ID } from "@/lib/firebase/player-mirror-seed";
import {
  assertCanApproveMembers,
  buildMembershipApproval,
  buildPendingMembershipDocs,
  normalizeMembershipRequest,
  type MembershipLike,
  type PendingMembershipDocs
} from "@/lib/firebase/club-membership";
import type { ClubRole } from "@/lib/firebase/types";

export type MembershipRequestAuth = {
  uid: string;
  phoneNumber?: string | null;
  email?: string | null;
};

export type MembershipRequestAdapters = {
  verifyIdToken: (idToken: string) => Promise<MembershipRequestAuth>;
  verifyClub: (clubId: string) => Promise<{ id: string; name?: string | null } | null>;
  readMembership: (clubId: string, uid: string) => Promise<MembershipLike | null>;
  writePendingMembership: (
    clubId: string,
    uid: string,
    docs: PendingMembershipDocs
  ) => Promise<void>;
  now?: () => unknown;
};

export type MembershipApprovalAdapters = {
  verifyIdToken: (idToken: string) => Promise<{ uid: string }>;
  verifyClub: (clubId: string) => Promise<{ id: string; name?: string | null } | null>;
  readMembership: (clubId: string, uid: string) => Promise<MembershipLike | null>;
  readTargetMembership: (clubId: string, targetUid: string) => Promise<MembershipLike | null>;
  writeApproval: (
    clubId: string,
    targetUid: string,
    approval: ReturnType<typeof buildMembershipApproval>
  ) => Promise<void>;
  now?: () => unknown;
};

function jsonError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw Object.assign(new Error("Sign in first."), { status: 401 });
  }
  return match[1];
}

async function parseBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Request body must be a JSON object.");
    }
    return body as Record<string, unknown>;
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 });
  }
}

function requireClubId(body: Record<string, unknown>) {
  if (typeof body.clubId !== "string" || !body.clubId.trim()) {
    throw Object.assign(new Error("clubId is required."), { status: 400 });
  }
  if (body.expectedProjectId !== IREM_FIREBASE_PROJECT_ID) {
    throw Object.assign(new Error(`expectedProjectId must be "${IREM_FIREBASE_PROJECT_ID}".`), {
      status: 400
    });
  }
  return body.clubId;
}

function statusOf(error: unknown) {
  return error && typeof error === "object" && "status" in error && typeof error.status === "number"
    ? error.status
    : 500;
}

/**
 * A signed-in phone user asks to join the club. Creates a "requested" membership
 * the owner can approve. Idempotent: re-requesting refreshes the name; an already
 * active member is left untouched.
 */
export async function handleMembershipRequest(
  request: Request,
  adapters: MembershipRequestAdapters
) {
  try {
    const body = await parseBody(request);
    const clubId = requireClubId(body);
    let normalized;
    try {
      normalized = normalizeMembershipRequest({
        fullName: body.fullName,
        gameTextConsent: body.gameTextConsent
      });
    } catch (error) {
      // Name/consent validation failures are client errors, not server errors.
      throw Object.assign(error instanceof Error ? error : new Error("Invalid request."), {
        status: 400
      });
    }

    const decoded = await adapters.verifyIdToken(getBearerToken(request));
    const club = await adapters.verifyClub(clubId);
    if (!club) {
      return jsonError(`Club "${clubId}" was not found.`, 404);
    }

    const existing = await adapters.readMembership(clubId, decoded.uid);
    if (existing?.status === "active") {
      return NextResponse.json({ ok: true, status: "already-member" });
    }

    const now = adapters.now?.() ?? new Date().toISOString();
    const docs = buildPendingMembershipDocs({
      uid: decoded.uid,
      clubId,
      clubName: club.name ?? "",
      fullName: normalized.fullName,
      phoneNumber: decoded.phoneNumber ?? null,
      email: decoded.email ?? null,
      gameTextConsent: normalized.gameTextConsent,
      now
    });

    await adapters.writePendingMembership(clubId, decoded.uid, docs);
    return NextResponse.json({ ok: true, status: "requested" });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Could not submit your join request.",
      statusOf(error)
    );
  }
}

/** Owner/admin approves (or denies) a pending request. */
export async function handleMembershipApproval(
  request: Request,
  adapters: MembershipApprovalAdapters
) {
  try {
    const body = await parseBody(request);
    const clubId = requireClubId(body);

    const targetUid = typeof body.targetUid === "string" ? body.targetUid.trim() : "";
    if (!targetUid) {
      return jsonError("targetUid is required.", 400);
    }
    const linkedPlayerId =
      typeof body.linkedPlayerId === "string" && body.linkedPlayerId.trim()
        ? body.linkedPlayerId.trim()
        : null;
    const role =
      body.role === "admin" || body.role === "scorekeeper" || body.role === "member"
        ? (body.role as ClubRole)
        : undefined;

    const decoded = await adapters.verifyIdToken(getBearerToken(request));
    const club = await adapters.verifyClub(clubId);
    if (!club) {
      return jsonError(`Club "${clubId}" was not found.`, 404);
    }

    assertCanApproveMembers(await adapters.readMembership(clubId, decoded.uid));

    const target = await adapters.readTargetMembership(clubId, targetUid);
    if (!target) {
      return jsonError("That member request was not found.", 404);
    }

    const approval = buildMembershipApproval({
      role,
      linkedPlayerId,
      approvedByUid: decoded.uid,
      now: adapters.now?.() ?? new Date().toISOString()
    });

    await adapters.writeApproval(clubId, targetUid, approval);
    return NextResponse.json({ ok: true, status: "active", targetUid });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Could not approve that member.",
      statusOf(error)
    );
  }
}
