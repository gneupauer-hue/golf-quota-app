import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";

export const dynamic = "force-dynamic";

export default function LeaderboardPage() {
  return (
    <div className="space-y-3">
      <PageTitle
        title="Leaderboard"
        subtitle="Paused during the score-reliability simplification."
      />
      <SectionCard className="space-y-2">
        <h3 className="text-lg font-semibold text-ink">Temporarily unavailable</h3>
        <p className="text-sm text-ink/65">
          Live leaderboard and projection features are turned off for now so active rounds can
          focus on reliable score capture and submission tracking.
        </p>
      </SectionCard>
    </div>
  );
}
