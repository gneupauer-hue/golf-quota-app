import Link from "next/link";
import { redirect } from "next/navigation";
import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";
import { getCurrentRoundId, getRoundEditorData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function CurrentRoundPage({
  searchParams
}: {
  searchParams?: Promise<{ deleted?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  let roundId: string | null = null;
  let loadError = false;

  try {
    roundId = await getCurrentRoundId();
  } catch (error) {
    console.error("[current-round] Could not load current round", error);
    loadError = true;
  }

  if (roundId) {
    const data = await getRoundEditorData(roundId).catch((error) => {
      console.error("[current-round] Could not load round editor data", error);
      loadError = true;
      return null;
    });

    if (data?.round.lockedAt || data?.round.startedAt) {
      redirect(`/rounds/${roundId}`);
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="Current Round"
        subtitle="Set up or open today's round from here."
      />
      {params?.deleted === "1" ? (
        <SectionCard className="space-y-2">
          <h3 className="text-base font-semibold text-pine">Round deleted</h3>
          <p className="text-sm text-ink/75">
            The current round was removed. Set up a new round when the group is ready.
          </p>
        </SectionCard>
      ) : null}
      {loadError ? (
        <SectionCard className="space-y-2 border border-danger/20 bg-[#FCE5E2]">
          <h3 className="text-base font-semibold text-danger">Current round temporarily unavailable</h3>
          <p className="text-sm text-ink/75">Refresh in a moment. The page is protected from crashing while the database recovers.</p>
        </SectionCard>
      ) : null}
      <SectionCard className="space-y-4 border border-pine/20 bg-[#FBF7F0]">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-pine">No Active Round</p>
        <div className="space-y-2">
          <h3 className="text-2xl font-semibold text-ink">
            {roundId ? "Round setup is still in progress" : "Set Up New Round"}
          </h3>
          <p className="text-sm text-ink/70">
            {roundId
              ? "Finish setup, then Current Round will open automatically once the round is live."
              : "Set up a new scorecard when the group is ready."}
          </p>
        </div>
        <Link href="/round-setup" className="club-btn-primary min-h-14">
          {roundId ? "Continue Setup" : "Set Up New Round"}
        </Link>
      </SectionCard>
    </div>
  );
}

