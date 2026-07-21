import { prisma } from "@/lib/prisma";
import { handleActiveRoundPreparationRepairRequest } from "@/lib/firebase/active-round-preparation-route";
import { buildActiveRoundPreparationFirestoreAdapters } from "@/lib/firebase/active-round-preparation-firestore";
import { selectActivePrismaRoundSetup } from "@/lib/firebase/round-mirror-prisma";
import { selectActivePrismaRoundScores } from "@/lib/firebase/score-mirror-prisma";

export async function POST(request: Request) {
  const { getFirebaseAdminAuth, getFirebaseAdminDb } = await import("@/lib/firebase/admin");
  const auth = await getFirebaseAdminAuth();
  const db = await getFirebaseAdminDb();

  return handleActiveRoundPreparationRepairRequest(request, {
    verifyIdToken: async (idToken) => auth.verifyIdToken(idToken),
    ...buildActiveRoundPreparationFirestoreAdapters(db),
    readActivePrismaRoundSetup: async () => selectActivePrismaRoundSetup(prisma),
    readActivePrismaRoundScores: async () => selectActivePrismaRoundScores(prisma)
  });
}
