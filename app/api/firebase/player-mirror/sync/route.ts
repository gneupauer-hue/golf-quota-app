import type { Firestore } from "firebase-admin/firestore";
import { prisma } from "@/lib/prisma";
import {
  handlePlayerMirrorSyncRequest,
  type PlayerMirrorSyncMembership
} from "@/lib/firebase/player-mirror-sync-route";

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
    writePlayerMirrors: async () => {
      throw new Error("Checkpoint 4A does not support Firestore writes.");
    }
  });
}
