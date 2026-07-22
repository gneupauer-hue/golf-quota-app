import { FirebaseAccountPanel } from "@/components/firebase-account-panel";
import { PhoneSignInCard } from "@/components/phone-signin-card";
import { MemberApprovalsCard } from "@/components/member-approvals-card";
import { GameAnnounceCard } from "@/components/game-announce-card";
import { AppVersionBadge } from "@/components/app-version-badge";
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

  return (
    <div className="space-y-4">
      <PhoneSignInCard />
      <MemberApprovalsCard />
      <GameAnnounceCard />
      <FirebaseAccountPanel activePrismaRoundId={activePrismaRoundId} />
      <AppVersionBadge />
    </div>
  );
}
