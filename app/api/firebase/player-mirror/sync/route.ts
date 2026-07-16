import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { prisma } from "@/lib/prisma";
import {
  handlePlayerMirrorSyncRequest,
  type PlayerMirrorSyncMembership
} from "@/lib/firebase/player-mirror-sync-route";
import type { FirebasePlayerMirror } from "@/lib/firebase/types";

const PLAYER_MIRROR_LOCK_TTL_MS = 2 * 60 * 1000;

async function readPrismaPlayers() {
  return prisma.player.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      quota: true,
      currentQuota: true,
      startingQuota: true,
      isActive: true,
      isRegular: true,
      updatedAt: true,
      conflictsFrom: {
        select: {
          conflictPlayerId: true
        }
      },
      _count: {
        select: {
          roundEntries: {
            where: {
              round: {
                completedAt: { not: null },
                canceledAt: null,
                isTestRound: false
              }
            }
          }
        }
      }
    }
  });
}

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

      return (snapshot.data() as PlayerMirrorSyncMembership | undefined) ?? null;
    },
    readFirestorePlayers: async (clubId: string) => {
      const snapshot = await db.collection("clubs").doc(clubId).collection("players").get();

      return snapshot.docs.map((doc) => {
        const data = doc.data() as { prismaPlayerId?: unknown; checksum?: unknown };

        return {
          docId: doc.id,
          prismaPlayerId: typeof data.prismaPlayerId === "string" ? data.prismaPlayerId : doc.id,
          checksum: typeof data.checksum === "string" ? data.checksum : ""
        };
      });
    }
  };
}

export async function POST(request: Request) {
  const { getFirebaseAdminAuth, getFirebaseAdminDb } = await import("@/lib/firebase/admin");
  const auth = await getFirebaseAdminAuth();
  const db = await getFirebaseAdminDb();

  return handlePlayerMirrorSyncRequest(request, {
    verifyIdToken: async (idToken) => auth.verifyIdToken(idToken),
    ...buildFirestoreAdapters(db),
    readPrismaPlayers,
    acquirePlayerMirrorWriteLock: async (clubId, uid) => {
      const lockRef = db
        .collection("clubs")
        .doc(clubId)
        .collection("syncLocks")
        .doc("playerMirror");
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
          throw Object.assign(new Error("Player mirror sync is already running."), {
            status: 409
          });
        }

        transaction.set(lockRef, {
          token,
          lockedByUid: uid,
          lockedAt: FieldValue.serverTimestamp(),
          expiresAt: Timestamp.fromDate(new Date(Date.now() + PLAYER_MIRROR_LOCK_TTL_MS))
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
    writePlayerMirrors: async (clubId, players: FirebasePlayerMirror[]) => {
      if (!players.length) {
        return 0;
      }

      const batch = db.batch();
      const collection = db.collection("clubs").doc(clubId).collection("players");

      for (const player of players) {
        batch.set(collection.doc(player.prismaPlayerId), {
          ...player,
          syncedAt: FieldValue.serverTimestamp()
        });
      }

      await batch.commit();
      return players.length;
    }
  });
}
