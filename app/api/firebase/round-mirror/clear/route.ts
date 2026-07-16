import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { resolveActiveRound } from "@/lib/active-round";
import {
  handleRoundMirrorClearRequest,
  type RoundMirrorClearMembership
} from "@/lib/firebase/round-mirror-clear-route";
import { prisma } from "@/lib/prisma";

const ROUND_MIRROR_LOCK_TTL_MS = 2 * 60 * 1000;

function buildFirestoreAdapters(db: Firestore) {
  return {
    verifyClub: async (clubId: string) => {
      const snapshot = await db.collection("clubs").doc(clubId).get();

      if (!snapshot.exists) {
        return null;
      }

      const data = snapshot.data() as { name?: string | null } | undefined;
      return {
        id: clubId,
        name: data?.name ?? null
      };
    },
    readClubMembership: async (clubId: string, uid: string) => {
      const snapshot = await db.collection("clubs").doc(clubId).collection("members").doc(uid).get();

      if (!snapshot.exists) {
        return null;
      }

      return (snapshot.data() as RoundMirrorClearMembership | undefined) ?? null;
    },
    readFirestoreRound: async (clubId: string, roundId: string) => {
      const snapshot = await db.collection("clubs").doc(clubId).collection("rounds").doc(roundId).get();

      if (!snapshot.exists) {
        return null;
      }

      const data = snapshot.data() as {
        isTestRound?: unknown;
        prismaRoundId?: unknown;
      } | undefined;

      return {
        docId: snapshot.id,
        prismaRoundId: typeof data?.prismaRoundId === "string" ? data.prismaRoundId : undefined,
        isTestRound: typeof data?.isTestRound === "boolean" ? data.isTestRound : undefined
      };
    },
    readFirestoreActivePointer: async (clubId: string) => {
      const snapshot = await db.collection("clubs").doc(clubId).collection("state").doc("activeRound").get();

      if (!snapshot.exists) {
        return null;
      }

      const data = snapshot.data() as {
        roundId?: unknown;
        prismaRoundId?: unknown;
      } | undefined;

      return {
        roundId: typeof data?.roundId === "string" ? data.roundId : undefined,
        prismaRoundId: typeof data?.prismaRoundId === "string" ? data.prismaRoundId : undefined
      };
    }
  };
}

async function acquireRoundMirrorLock(db: Firestore, clubId: string, uid: string) {
  const lockRef = db
    .collection("clubs")
    .doc(clubId)
    .collection("syncLocks")
    .doc("roundMirror");
  const token = `${uid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(lockRef);
    const data = snapshot.data() as
      | { token?: unknown; expiresAt?: { toDate?: () => Date } | Date }
      | undefined;
    const expiresAt =
      data?.expiresAt instanceof Date
        ? data.expiresAt
        : typeof data?.expiresAt?.toDate === "function"
          ? data.expiresAt.toDate()
          : null;

    if (snapshot.exists && expiresAt && expiresAt.getTime() > Date.now()) {
      throw Object.assign(new Error("Round mirror operation is already running."), {
        status: 409
      });
    }

    transaction.set(lockRef, {
      token,
      lockedByUid: uid,
      lockedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + ROUND_MIRROR_LOCK_TTL_MS))
    });
  });

  return async () => {
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(lockRef);
      const data = snapshot.data() as { token?: unknown } | undefined;

      if (snapshot.exists && data?.token === token) {
        transaction.delete(lockRef);
      }
    });
  };
}

export async function POST(request: Request) {
  const { getFirebaseAdminAuth, getFirebaseAdminDb } = await import("@/lib/firebase/admin");
  const auth = await getFirebaseAdminAuth();
  const db = await getFirebaseAdminDb();

  return handleRoundMirrorClearRequest(request, {
    verifyIdToken: async (idToken) => auth.verifyIdToken(idToken),
    ...buildFirestoreAdapters(db),
    readActivePrismaRoundId: async () => {
      const activeRound = await resolveActiveRound(prisma);
      return activeRound?.id ?? null;
    },
    acquireRoundMirrorClearLock: async (clubId, uid) => acquireRoundMirrorLock(db, clubId, uid),
    clearRoundMirror: async (clubId, roundId) => {
      const clubRef = db.collection("clubs").doc(clubId);
      const roundRef = clubRef.collection("rounds").doc(roundId);
      const entriesSnapshot = await roundRef.collection("entries").get();
      const batch = db.batch();

      for (const entry of entriesSnapshot.docs) {
        batch.delete(entry.ref);
      }

      batch.delete(roundRef);
      batch.delete(clubRef.collection("state").doc("activeRound"));

      await batch.commit();

      return {
        entriesDeleted: entriesSnapshot.docs.length,
        roundDeleted: true,
        pointerCleared: true,
        writesApplied: entriesSnapshot.docs.length + 2
      };
    }
  });
}
