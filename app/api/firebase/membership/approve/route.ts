import { FieldValue } from "firebase-admin/firestore";
import { handleMembershipApproval } from "@/lib/firebase/membership-routes";
import type { MembershipLike } from "@/lib/firebase/club-membership";
import { getOwnerNotifyAddress, isEmailNotificationConfigured, sendEmail } from "@/lib/email/resend";
import { isSmsConfigured, sendSms } from "@/lib/sms/twilio";

const MEMBERS_URL = "https://golf-quota-app-three.vercel.app/account";
const APP_URL = "https://golf-quota-app-three.vercel.app";

export async function POST(request: Request) {
  const { getFirebaseAdminAuth, getFirebaseAdminDb } = await import("@/lib/firebase/admin");
  const auth = await getFirebaseAdminAuth();
  const db = await getFirebaseAdminDb();

  async function readMembership(clubId: string, uid: string): Promise<MembershipLike | null> {
    const snapshot = await db.collection("clubs").doc(clubId).collection("members").doc(uid).get();
    return snapshot.exists ? ((snapshot.data() as MembershipLike | undefined) ?? null) : null;
  }

  return handleMembershipApproval(request, {
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
    writeApproval: async (clubId, targetUid, approval) => {
      const memberRef = db.collection("clubs").doc(clubId).collection("members").doc(targetUid);
      const userMembershipRef = db
        .collection("userClubMemberships")
        .doc(`${targetUid}_${clubId}`);
      await db.runTransaction(async (transaction) => {
        transaction.set(memberRef, approval, { merge: true });
        transaction.set(userMembershipRef, approval, { merge: true });
      });
    },
    onMembershipApproved: async ({ fullName, phoneNumber }) => {
      // Text the newly-approved member (best-effort) so they know they're in.
      if (isSmsConfigured() && phoneNumber) {
        try {
          await sendSms({
            to: phoneNumber,
            body: `You're approved for the Irem golf app — you can enter scores now. ${APP_URL}`
          });
        } catch {
          // ignore SMS failures
        }
      }

      // Email the owner a record of the approval.
      const to = getOwnerNotifyAddress();
      if (!isEmailNotificationConfigured() || !to) {
        return; // Email not set up — skip silently.
      }
      await sendEmail({
        to,
        subject: `Irem golf member approved: ${fullName}`,
        text:
          `${fullName} (${phoneNumber ?? "no phone on file"}) was approved and can now enter scores.\n\n` +
          `If this wasn't expected, you can remove them here: ${MEMBERS_URL}`
      });
    },
    now: () => FieldValue.serverTimestamp()
  });
}
