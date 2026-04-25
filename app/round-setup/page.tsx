import Link from "next/link";
import { NewRoundForm } from "@/components/new-round-form";
import { RoundEditor } from "@/components/round-editor";
import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";
import { getCurrentRoundId, getRoundEditorData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function RoundSetupPage() {
  const roundId = await getCurrentRoundId();

  if (!roundId) {
    return <NewRoundForm />;
  }

  const data = await getRoundEditorData(roundId);

  if (!data) {
    return <NewRoundForm />;
  }

  if (data.round.lockedAt || data.round.startedAt) {
    return (
      <div className="space-y-4">
        <PageTitle
          title="Round Setup"
          subtitle="Pre-round setup stays here. Live scoring moves to Current Round once the round starts."
        />
        <SectionCard className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
            Setup Complete
          </p>
          <h3 className="text-xl font-semibold text-ink">This round is already active</h3>
          <p className="text-sm text-ink/65">
            Team setup is finished for {data.round.roundName}. Use Current Round for live scoring and submissions.
          </p>
          <Link href="/current-round" className="club-btn-primary min-h-12">
            Go To Current Round
          </Link>
        </SectionCard>
      </div>
    );
  }

  return (
    <RoundEditor
      round={data.round}
      players={data.players}
      quotaSnapshot={data.quotaSnapshot}
      groups={data.groups as Array<{ groupNumber: number; teeTime: string; players: string[] }>}
    />
  );
}
