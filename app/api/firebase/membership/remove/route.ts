import { FieldValue } from "firebase-admin/firestore";
import { handleMembershipRemoval } from "@/lib/firebase/membership-routes";
import type { MembershipLike } from "@/lib/firebase/club-membership";

export async function POST(request: Request) {
  const { getFirebaseAdminAuth, getFirebaseAdminDb } = await import("@/lib/firebase/admin");
  const auth = await getFirebaseAdminAuth();
  const db = await getFirebaseAdminDb();

  async function readMembership(clubId: string, uid: string): Promise<MembershipLike | null> {
    const snapshot = await db.collection("clubs").doc(clubId).collection("members").doc(uid).get();
    return snapshot.exists ? ((snapshot.data() as MembershipLike | undefined) ?? null) : null;
  }

  return handleMembershipRemoval(request, {
    verifyIdToken: async (idToken) => {
      const decoded = await auth.verifyIdToken(idToken);
      return { uid: decoded.uid };
    },
    verifyClub: async (clubId) => {
      const snapshot = await db.collection("clubs").doc(clubId).get();
      return snapshot.exists ? { id: clubId, name: (snapshot.data()?.name as string | undefined) ?? null } : null;
    },
    readMembership,
    readTargetMembership: readMembership,
    writeRemoval: async (clubId, targetUid, removal) => {
      const memberRef = db.collection("clubs").doc(clubId).collection("members").doc(targetUid);
      const userMembershipRef = db
        .collection("userClubMemberships")
        .doc(`${targetUid}_${clubId}`);
      await db.runTransaction(async (transaction) => {
        transaction.set(memberRef, removal, { merge: true });
        transaction.set(userMembershipRef, removal, { merge: true });
      });
    },
    now: () => FieldValue.serverTimestamp()
  });
}
