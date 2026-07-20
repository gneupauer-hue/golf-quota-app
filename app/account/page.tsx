import { FirebaseAccountPanel } from "@/components/firebase-account-panel";
import { selectActivePrismaRoundSetup } from "@/lib/firebase/round-mirror-prisma";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getActivePrismaRoundIdForValidation() {
  try {
    const activeRound = await selectActivePrismaRoundSetup(prisma);
    return activeRound?.id ?? null;
  } catch {
    return null;
  }
}

export default async function AccountPage() {
  const activePrismaRoundId = await getActivePrismaRoundIdForValidation();

  return <FirebaseAccountPanel activePrismaRoundId={activePrismaRoundId} />;
}
