import { PlayersManager } from "@/components/players-manager";
import { getPlayersPageData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const data = await getPlayersPageData();

  return (
    <PlayersManager
      initialPlayers={data.players}
      initialQuotaAudit={data.quotaAudit}
      initialBaselineRows={data.baselineRows}
    />
  );
}
