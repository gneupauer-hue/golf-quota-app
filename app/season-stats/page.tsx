import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";

export const dynamic = "force-dynamic";

export default function SeasonStatsPage() {
  return (
    <div className="space-y-3">
      <PageTitle
        title="Season Stats"
        subtitle="Paused during the score-reliability simplification."
      />
      <SectionCard className="space-y-2">
        <h3 className="text-lg font-semibold text-ink">Temporarily unavailable</h3>
        <p className="text-sm text-ink/65">
          Season tracking is turned off for now while active-round scoring is stripped down to the
          most reliable workflow.
        </p>
      </SectionCard>
    </div>
  );
}
