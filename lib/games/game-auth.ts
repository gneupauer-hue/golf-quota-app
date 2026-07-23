// Server-side auth for the game board. Every game route requires a signed-in,
// owner-approved member. Games are served through these routes (Admin SDK) rather
// than read directly from the client, so no Firestore security-rule changes are
// needed for members to see the board.

export const IREM_CLUB_ID = "eO5PwRmRZrQJW0VbEp0B";
export const APP_URL = "https://golf-quota-app-three.vercel.app/games";

/** First non-empty string from the candidates, else "Member". */
export function pickName(candidates: Array<unknown>): string {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return "Member";
}

export type ActiveMemberContext = {
  uid: string;
  displayName: string;
  role: string;
  isOwner: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
};

export async function requireActiveMember(
  request: Request,
  clubId: string = IREM_CLUB_ID
): Promise<ActiveMemberContext> {
  const authHeader = request.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw Object.assign(new Error("Sign in first."), { status: 401 });
  }

  const { getFirebaseAdminAuth, getFirebaseAdminDb } = await import("@/lib/firebase/admin");
  const auth = await getFirebaseAdminAuth();
  const db = await getFirebaseAdminDb();

  const decoded = await auth.verifyIdToken(match[1]);
  const snapshot = await db
    .collection("clubs")
    .doc(clubId)
    .collection("members")
    .doc(decoded.uid)
    .get();
  const member = snapshot.exists
    ? (snapshot.data() as
        | { displayName?: unknown; fullName?: unknown; role?: unknown; status?: unknown }
        | undefined)
    : null;

  if (!member || member.status !== "active") {
    throw Object.assign(new Error("You need to be an approved member to use the game board."), {
      status: 403
    });
  }

  const decodedName = (decoded as { name?: unknown }).name;
  const displayName = pickName([
    member.displayName,
    member.fullName,
    decodedName,
    decoded.phone_number
  ]);

  const role = typeof member.role === "string" ? member.role : "member";
  return {
    uid: decoded.uid,
    displayName,
    role,
    isOwner: role === "owner" || role === "admin",
    db
  };
}

export function statusOf(error: unknown): number {
  return error && typeof error === "object" && "status" in error && typeof error.status === "number"
    ? error.status
    : 500;
}

/** Phone numbers of active members who opted in to game texts. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getGameTextRecipients(db: any, clubId: string = IREM_CLUB_ID): Promise<string[]> {
  const snapshot = await db
    .collection("clubs")
    .doc(clubId)
    .collection("members")
    .where("status", "==", "active")
    .get();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return snapshot.docs
    .map((doc: any) => doc.data() as { gameTextConsent?: unknown; phoneNumber?: unknown })
    .filter(
      (member: { gameTextConsent?: unknown; phoneNumber?: unknown }) =>
        member?.gameTextConsent === true &&
        typeof member.phoneNumber === "string" &&
        member.phoneNumber.trim().length > 0
    )
    .map((member: { phoneNumber?: unknown }) => (member.phoneNumber as string).trim());
}
