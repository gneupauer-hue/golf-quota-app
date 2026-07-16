import type { Firestore } from "firebase-admin/firestore";
import { prisma } from "@/lib/prisma";
import { handleRoundMirrorDryRunRequest } from "@/lib/firebase/round-mirror-dry-run-route";
import { selectActivePrismaRoundSetup } from "@/lib/firebase/round-mirror-prisma";
import type { RoundMirrorDryRunMembership } from "@/lib/firebase/round-mirror-dry-run-route";

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

      return (snapshot.data() as RoundMirrorDryRunMembership | undefined) ?? null;
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

  return handleRoundMirrorDryRunRequest(request, {
    verifyIdToken: async (idToken) => auth.verifyIdToken(idToken),
    ...buildFirestoreAdapters(db),
    readActivePrismaRoundSetup: async () => selectActivePrismaRoundSetup(prisma)
  });
}
