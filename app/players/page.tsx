import { PlayersManager } from "@/components/players-manager";
import { getCurrentQuotaRows, getPlayersPageData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const [data, currentQuotaRows] = await Promise.all([
    getPlayersPageData(),
    getCurrentQuotaRows()
  ]);

  return (
    <PlayersManager
      initialPlayers={data.players}
      initialQuotaAudit={data.quotaAudit}
      initialBaselineRows={data.baselineRows}
      initialCurrentQuotaRows={currentQuotaRows}
    />
  );
}
