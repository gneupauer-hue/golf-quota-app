import { canMemberEnterScores, type MembershipLike } from "@/lib/firebase/club-membership";

export type ScoreAccessAdapters = {
  // Returns the verified user's uid, or null if the session cookie is missing/expired/invalid.
  verifySessionCookie: (cookie: string) => Promise<{ uid: string } | null>;
  readMembership: (clubId: string, uid: string) => Promise<MembershipLike | null>;
};

export type ScoreAccessInput = {
  clubId: string;
  sessionCookie: string | undefined;
  adapters: ScoreAccessAdapters;
};

/**
 * The scoring gate: only a signed-in, owner-approved (active) club member may
 * enter or edit scores. Fails closed — a missing/expired session or an
 * unapproved account is denied. Returns the verified uid for attribution.
 */
export async function assertCanEnterScores(input: ScoreAccessInput): Promise<{ uid: string }> {
  if (!input.sessionCookie) {
    throw Object.assign(
      new Error("Sign in with your approved account to enter scores."),
      { status: 401 }
    );
  }

  const decoded = await input.adapters.verifySessionCookie(input.sessionCookie);
  if (!decoded) {
    throw Object.assign(
      new Error("Your sign-in has expired. Sign in again to enter scores."),
      { status: 401 }
    );
  }

  const membership = await input.adapters.readMembership(input.clubId, decoded.uid);
  if (!canMemberEnterScores(membership)) {
    throw Object.assign(
      new Error("Your account is not approved to enter scores yet. Ask the club owner to approve you."),
      { status: 403 }
    );
  }

  return { uid: decoded.uid };
}
