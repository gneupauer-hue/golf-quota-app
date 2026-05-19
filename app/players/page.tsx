import { PlayersManager } from "@/components/players-manager";
import { SectionCard } from "@/components/section-card";
import { getPlayersPageData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const data = await getPlayersPageData().catch((error) => {
    console.error("[players] Could not load players page data", error);
    return null;
  });

  if (!data) {
    return (
      <SectionCard className="space-y-2 border border-danger/20 bg-[#FCE5E2]">
        <h3 className="text-base font-semibold text-danger">Players temporarily unavailable</h3>
        <p className="text-sm text-ink/75">Refresh in a moment. The page is protected from crashing while the database recovers.</p>
      </SectionCard>
    );
  }

  return (
    <PlayersManager
      initialPlayers={data.players}
      initialQuotaAudit={data.quotaAudit}
      initialBaselineRows={data.baselineRows}
    />
  );
}
