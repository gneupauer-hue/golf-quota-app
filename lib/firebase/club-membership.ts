import type {
  ClubRole,
  FirebaseClubMembership,
  FirebaseUserClubMembership
} from "@/lib/firebase/types";

// A phone signup starts as "requested" and can only enter/edit scores once the
// owner approves it to "active". Registering alone never grants scoring access.
export const MEMBERSHIP_REQUEST_STATUS = "requested" as const;
export const MEMBERSHIP_ACTIVE_STATUS = "active" as const;
export const DEFAULT_MEMBER_ROLE: ClubRole = "member";

const APPROVER_ROLES: ReadonlyArray<ClubRole> = ["owner", "admin"];
// Roles that are allowed to enter/edit scores once their membership is active.
const SCORING_ROLES: ReadonlyArray<ClubRole> = ["owner", "admin", "scorekeeper", "member"];

export type MembershipRequestInput = {
  fullName?: unknown;
  gameTextConsent?: unknown;
};

export type NormalizedMembershipRequest = {
  fullName: string;
  gameTextConsent: boolean;
};

/**
 * Validate what the signing-up golfer typed. The phone number itself comes from
 * the verified auth token, not this input — we only need their name (so the owner
 * can recognize the request) and their consent to future game texts.
 */
export function normalizeMembershipRequest(
  input: MembershipRequestInput
): NormalizedMembershipRequest {
  const fullName = typeof input.fullName === "string" ? input.fullName.trim().replace(/\s+/g, " ") : "";

  if (fullName.length < 2) {
    throw new Error("Enter your full name so the club owner can approve you.");
  }
  if (fullName.length > 80) {
    throw new Error("That name is too long. Use 80 characters or fewer.");
  }

  return {
    fullName,
    gameTextConsent: input.gameTextConsent === true
  };
}

export type PendingMembershipInput = {
  uid: string;
  clubId: string;
  clubName: string;
  fullName: string;
  phoneNumber: string | null;
  email: string | null;
  gameTextConsent: boolean;
  now: unknown;
};

export type PendingMembershipDocs = {
  member: FirebaseClubMembership;
  userMembership: FirebaseUserClubMembership;
};

/**
 * Build the two docs a pending request writes: the club-scoped member record the
 * owner reads to approve, and the user's own membership mirror. Both start
 * "requested" with the member role, so scoring stays blocked until approval.
 */
export function buildPendingMembershipDocs(input: PendingMembershipInput): PendingMembershipDocs {
  if (!input.uid.trim()) {
    throw new Error("A signed-in user is required to request membership.");
  }
  if (!input.clubId.trim()) {
    throw new Error("A club is required to request membership.");
  }

  const base = {
    uid: input.uid,
    email: input.email,
    displayName: input.fullName,
    role: DEFAULT_MEMBER_ROLE,
    status: MEMBERSHIP_REQUEST_STATUS,
    phoneNumber: input.phoneNumber,
    gameTextConsent: input.gameTextConsent,
    linkedPlayerId: null,
    requestedAt: input.now,
    approvedAt: null,
    approvedByUid: null,
    createdAt: input.now,
    updatedAt: input.now
  } satisfies FirebaseClubMembership;

  return {
    member: base,
    userMembership: {
      ...base,
      clubId: input.clubId,
      clubName: input.clubName
    }
  };
}

/**
 * Owner/admin approval turns a request "active" and optionally links it to an
 * existing roster player so score changes read as a real name (e.g. Bob Lipski).
 */
export type MembershipApprovalInput = {
  role?: ClubRole;
  linkedPlayerId?: string | null;
  approvedByUid: string;
  now: unknown;
};

export function buildMembershipApproval(input: MembershipApprovalInput) {
  if (!input.approvedByUid.trim()) {
    throw new Error("An approving owner or admin is required.");
  }

  const role = input.role ?? DEFAULT_MEMBER_ROLE;
  if (!SCORING_ROLES.includes(role)) {
    throw new Error("Approved members must have a valid club role.");
  }

  return {
    status: MEMBERSHIP_ACTIVE_STATUS,
    role,
    linkedPlayerId: input.linkedPlayerId?.trim() ? input.linkedPlayerId.trim() : null,
    approvedByUid: input.approvedByUid,
    approvedAt: input.now,
    updatedAt: input.now
  };
}

export type MembershipLike = {
  role?: ClubRole | string;
  status?: string;
};

/** Only active owners/admins may approve or manage other members. */
export function assertCanApproveMembers(membership: MembershipLike | null): void {
  if (!membership) {
    throw Object.assign(new Error("You are not a member of this club."), { status: 403 });
  }
  if (membership.status !== MEMBERSHIP_ACTIVE_STATUS) {
    throw Object.assign(new Error("Your club membership is not active."), { status: 403 });
  }
  if (!APPROVER_ROLES.includes(membership.role as ClubRole)) {
    throw Object.assign(new Error("Only club owners and admins can approve members."), {
      status: 403
    });
  }
}

/** The gate the scoring endpoints use: an active member in an allowed role. */
export function canMemberEnterScores(membership: MembershipLike | null): boolean {
  return Boolean(
    membership &&
      membership.status === MEMBERSHIP_ACTIVE_STATUS &&
      SCORING_ROLES.includes(membership.role as ClubRole)
  );
}
