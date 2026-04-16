import Link from "next/link";
import { redirect } from "next/navigation";
import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";
import { getCurrentRoundId } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function CurrentRoundPage({
  searchParams
}: {
  searchParams?: Promise<{ deleted?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const roundId = await getCurrentRoundId();

  if (roundId) {
    redirect(`/rounds/${roundId}`);
  }

  return (
    <div className="space-y-3">
      <PageTitle title="Current Round" subtitle="Open the live round when a game is in progress." />
      {params?.deleted === "1" ? (
        <SectionCard className="space-y-2">
          <h3 className="text-base font-semibold text-pine">Round deleted</h3>
          <p className="text-sm text-ink/75">
            The current round was removed and you can start a fresh one now.
          </p>
        </SectionCard>
      ) : null}
      <SectionCard className="space-y-3">
        <h3 className="text-lg font-semibold">No active round</h3>
        <p className="text-sm text-ink/65">Create a new round to start team setup and live scoring.</p>
        <Link href="/rounds/new" className="club-btn-primary min-h-12">
          New Round
        </Link>
      </SectionCard>
    </div>
  );
}
