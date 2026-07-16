import { FirebaseAccountPanel } from "@/components/firebase-account-panel";
import { getCurrentRoundId } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const activePrismaRoundId = await getCurrentRoundId();

  return <FirebaseAccountPanel activePrismaRoundId={activePrismaRoundId} />;
}
