import type { Firestore } from "firebase-admin/firestore";
import { prisma } from "@/lib/prisma";
import { handleScoreMirrorDryRunRequest } from "@/lib/firebase/score-mirror-dry-run-route";
import { selectActivePrismaRoundScores } from "@/lib/firebase/score-mirror-prisma";
import type { ScoreMirrorDryRunMembership } from "@/lib/firebase/score-mirror-dry-run-route";

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

      return (snapshot.data() as ScoreMirrorDryRunMembership | undefined) ?? null;
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
    }
  };
}

export async function POST(request: Request) {
  const { getFirebaseAdminAuth, getFirebaseAdminDb } = await import("@/lib/firebase/admin");
  const auth = await getFirebaseAdminAuth();
  const db = await getFirebaseAdminDb();

  return handleScoreMirrorDryRunRequest(request, {
    verifyIdToken: async (idToken) => auth.verifyIdToken(idToken),
    ...buildFirestoreAdapters(db),
    readActivePrismaRoundScores: async () => selectActivePrismaRoundScores(prisma)
  });
}
