import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { prisma } from "@/lib/prisma";
import {
  handleRoundMirrorPublishRequest,
  type RoundMirrorPublishMembership
} from "@/lib/firebase/round-mirror-publish-route";
import { selectActivePrismaRoundSetup } from "@/lib/firebase/round-mirror-prisma";

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

      return (snapshot.data() as RoundMirrorPublishMembership | undefined) ?? null;
    },
    readFirestoreRound: async (clubId: string, roundId: string) => {
      const snapshot = await db.collection("clubs").doc(clubId).collection("rounds").doc(roundId).get();

      if (!snapshot.exists) {
        return null;
      }

      const data = snapshot.data() as { prismaRoundId?: unknown; checksum?: unknown } | undefined;
      return {
        docId: snapshot.id,
        prismaRoundId: typeof data?.prismaRoundId === "string" ? data.prismaRoundId : snapshot.id,
        checksum: typeof data?.checksum === "string" ? data.checksum : ""
      };
    },
    readFirestoreRoundEntries: async (clubId: string, roundId: string) => {
      const snapshot = await db
        .collection("clubs")
        .doc(clubId)
        .collection("rounds")
        .doc(roundId)
        .collection("entries")
        .get();

      return snapshot.docs.map((doc) => {
        const data = doc.data() as {
          prismaPlayerId?: unknown;
          playerName?: unknown;
          checksum?: unknown;
        };

        return {
          docId: doc.id,
          prismaPlayerId: typeof data.prismaPlayerId === "string" ? data.prismaPlayerId : doc.id,
          playerName: typeof data.playerName === "string" ? data.playerName : null,
          checksum: typeof data.checksum === "string" ? data.checksum : ""
        };
      });
    },
    readFirestoreActivePointer: async (clubId: string) => {
      const snapshot = await db.collection("clubs").doc(clubId).collection("state").doc("activeRound").get();

      if (!snapshot.exists) {
        return null;
      }

      const data = snapshot.data() as {
        roundId?: unknown;
        prismaRoundId?: unknown;
        checksum?: unknown;
      } | undefined;

      return {
        roundId: typeof data?.roundId === "string" ? data.roundId : undefined,
        prismaRoundId: typeof data?.prismaRoundId === "string" ? data.prismaRoundId : undefined,
        checksum: typeof data?.checksum === "string" ? data.checksum : ""
      };
    }
  };
}

export async function POST(request: Request) {
  const { getFirebaseAdminAuth, getFirebaseAdminDb } = await import("@/lib/firebase/admin");
  const auth = await getFirebaseAdminAuth();
  const db = await getFirebaseAdminDb();

  return handleRoundMirrorPublishRequest(request, {
    verifyIdToken: async (idToken) => auth.verifyIdToken(idToken),
    ...buildFirestoreAdapters(db),
    readActivePrismaRoundSetup: async () => selectActivePrismaRoundSetup(prisma),
    acquireRoundMirrorPublishLock: async (clubId, uid) => {
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
          throw Object.assign(new Error("Round mirror publish is already running."), {
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
    },
    writeRoundMirror: async (clubId, roundId, input) => {
      const batch = db.batch();
      const clubRef = db.collection("clubs").doc(clubId);
      const roundRef = clubRef.collection("rounds").doc(roundId);
      const now = FieldValue.serverTimestamp();
      let writes = 0;

      if (input.round) {
        batch.set(roundRef, {
          ...input.round,
          syncedAt: now
        });
        writes += 1;
      }

      for (const entry of input.entries) {
        batch.set(roundRef.collection("entries").doc(entry.prismaPlayerId), {
          ...entry,
          syncedAt: now
        });
        writes += 1;
      }

      if (input.activePointer) {
        batch.set(clubRef.collection("state").doc("activeRound"), {
          ...input.activePointer,
          syncedAt: now
        });
        writes += 1;
      }

      if (writes === 0) {
        return 0;
      }

      await batch.commit();
      return writes;
    }
  });
}
