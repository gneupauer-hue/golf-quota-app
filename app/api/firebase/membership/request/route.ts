import { FieldValue } from "firebase-admin/firestore";
import { handleMembershipRequest } from "@/lib/firebase/membership-routes";
import type { MembershipLike } from "@/lib/firebase/club-membership";
import { getOwnerNotifyAddress, isEmailNotificationConfigured, sendEmail } from "@/lib/email/resend";

const APP_URL = "https://golf-quota-app-three.vercel.app/account";

export async function POST(request: Request) {
  const { getFirebaseAdminAuth, getFirebaseAdminDb } = await import("@/lib/firebase/admin");
  const auth = await getFirebaseAdminAuth();
  const db = await getFirebaseAdminDb();

  return handleMembershipRequest(request, {
    verifyIdToken: async (idToken) => {
      const decoded = await auth.verifyIdToken(idToken);
      return {
        uid: decoded.uid,
        phoneNumber: (decoded.phone_number as string | undefined) ?? null,
        email: decoded.email ?? null
      };
    },
    verifyClub: async (clubId) => {
      const snapshot = await db.collection("clubs").doc(clubId).get();
      return snapshot.exists ? { id: clubId, name: (snapshot.data()?.name as string | undefined) ?? null } : null;
    },
    readMembership: async (clubId, uid) => {
      const snapshot = await db.collection("clubs").doc(clubId).collection("members").doc(uid).get();
      return snapshot.exists ? ((snapshot.data() as MembershipLike | undefined) ?? null) : null;
    },
    writePendingMembership: async (clubId, uid, docs) => {
      const clubRef = db.collection("clubs").doc(clubId);
      const memberRef = clubRef.collection("members").doc(uid);
      const userMembershipRef = db.collection("userClubMemberships").doc(`${uid}_${clubId}`);
      await db.runTransaction(async (transaction) => {
        transaction.set(memberRef, docs.member, { merge: true });
        transaction.set(userMembershipRef, docs.userMembership, { merge: true });
      });
    },
    onMembershipRequested: async ({ fullName, phoneNumber }) => {
      const to = getOwnerNotifyAddress();
      if (!isEmailNotificationConfigured() || !to) {
        return; // Email not set up yet — skip silently.
      }
      await sendEmail({
        to,
        subject: `New Irem golf request: ${fullName}`,
        text:
          `${fullName} (${phoneNumber ?? "no phone on file"}) requested to join the Irem golf app.\n\n` +
          `Approve them here: ${APP_URL}`
      });
    },
    now: () => FieldValue.serverTimestamp()
  });
}
