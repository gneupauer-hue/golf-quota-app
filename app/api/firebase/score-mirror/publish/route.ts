import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { prisma } from "@/lib/prisma";
import {
  handleScoreMirrorPublishRequest,
  type ScoreMirrorPublishMembership
} from "@/lib/firebase/score-mirror-publish-route";
import { selectActivePrismaRoundScores } from "@/lib/firebase/score-mirror-prisma";

const SCORE_MIRROR_LOCK_TTL_MS = 2 * 60 * 1000;

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

      return (snapshot.data() as ScoreMirrorPublishMembership | undefined) ?? null;
    },
    readFirestoreScores: async (clubId: string, roundId: string) => {
      const snapshot = await db
        .collection("clubs")
        .doc(clubId)
        .collection("rounds")
        .doc(roundId)
        .collection("scores")
        .get();

      return snapshot.docs.map((doc) => {
        const data = doc.data() as {
          prismaEntryId?: unknown;
          prismaPlayerId?: unknown;
          playerName?: unknown;
          checksum?: unknown;
          source?: unknown;
          scoreVersion?: unknown;
          lastOperationId?: unknown;
          lastEditedByUid?: unknown;
          lastClientRequestId?: unknown;
        };

        return {
          docId: doc.id,
          prismaEntryId: typeof data.prismaEntryId === "string" ? data.prismaEntryId : undefined,
          prismaPlayerId: typeof data.prismaPlayerId === "string" ? data.prismaPlayerId : doc.id,
          playerName: typeof data.playerName === "string" ? data.playerName : null,
          checksum: typeof data.checksum === "string" ? data.checksum : "",
          source: data.source,
          scoreVersion: data.scoreVersion,
          lastOperationId: data.lastOperationId,
          lastEditedByUid: data.lastEditedByUid,
          lastClientRequestId: data.lastClientRequestId
        };
      });
    }
  };
}

export async function POST(request: Request) {
  const { getFirebaseAdminAuth, getFirebaseAdminDb } = await import("@/lib/firebase/admin");
  const auth = await getFirebaseAdminAuth();
  const db = await getFirebaseAdminDb();

  return handleScoreMirrorPublishRequest(request, {
    verifyIdToken: async (idToken) => auth.verifyIdToken(idToken),
    ...buildFirestoreAdapters(db),
    readActivePrismaRoundScores: async () => selectActivePrismaRoundScores(prisma),
    acquireScoreMirrorPublishLock: async (clubId, uid, operationId) => {
      const lockRef = db
        .collection("clubs")
        .doc(clubId)
        .collection("syncLocks")
        .doc("scoreMirror");

      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(lockRef);
        const data = snapshot.data() as
          | { operationId?: unknown; expiresAt?: { toDate?: () => Date } | Date }
          | undefined;
        const expiresAt =
          data?.expiresAt instanceof Date
            ? data.expiresAt
            : typeof data?.expiresAt?.toDate === "function"
              ? data.expiresAt.toDate()
              : null;

        if (snapshot.exists && expiresAt && expiresAt.getTime() > Date.now()) {
          throw Object.assign(new Error("Score mirror publish is already running."), {
            status: 409
          });
        }

        transaction.set(lockRef, {
          operationId,
          lockedByUid: uid,
          lockedAt: FieldValue.serverTimestamp(),
          expiresAt: Timestamp.fromDate(new Date(Date.now() + SCORE_MIRROR_LOCK_TTL_MS))
        });
      });

      return async () => {
        await db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(lockRef);
          const data = snapshot.data() as { operationId?: unknown } | undefined;

          if (snapshot.exists && data?.operationId === operationId) {
            transaction.delete(lockRef);
          }
        });
      };
    },
    writeScoreMirror: async (clubId, roundId, input) => {
      const batch = db.batch();
      const scoresRef = db
        .collection("clubs")
        .doc(clubId)
        .collection("rounds")
        .doc(roundId)
        .collection("scores");
      const now = FieldValue.serverTimestamp();
      let writes = 0;

      for (const score of input.scores) {
        batch.set(scoresRef.doc(score.prismaPlayerId), {
          ...score,
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
