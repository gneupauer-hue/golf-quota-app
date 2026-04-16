import Link from "next/link";
import { redirect } from "next/navigation";
import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";
import { getCurrentRoundId } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function CurrentRoundPage() {
  const roundId = await getCurrentRoundId();

  if (roundId) {
    redirect(`/rounds/${roundId}`);
  }

  return (
    <div className="space-y-3">
      <PageTitle title="Current Round" subtitle="Open the live round when a game is in progress." />
      <SectionCard className="space-y-3">
        <h3 className="text-lg font-semibold">No active round</h3>
        <p className="text-sm text-ink/65">Create a new round to start team setup and live scoring.</p>
        <Link href="/rounds/new" className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white">
          New Round
        </Link>
      </SectionCard>
    </div>
  );
}
