import { FirebaseAccountPanel } from "@/components/firebase-account-panel";
import { PhoneSignInCard } from "@/components/phone-signin-card";
import { MemberNameCard } from "@/components/member-name-card";
import { MemberApprovalsCard } from "@/components/member-approvals-card";
import Link from "next/link";
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
      <MemberNameCard />
      <MemberApprovalsCard />
      <GameAnnounceCard />
      <FirebaseAccountPanel activePrismaRoundId={activePrismaRoundId} />
      <Link
        href="/install"
        className="block rounded-2xl border border-ink/10 bg-canvas px-4 py-3 text-sm font-semibold text-pine"
      >
        Add this app to your phone&apos;s home screen →
      </Link>
      <AppVersionBadge />
    </div>
  );
}
