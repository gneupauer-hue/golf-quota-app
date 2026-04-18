import { PlayersManager } from "@/components/players-manager";
import { getPlayersPageData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const players = await getPlayersPageData();
  return <PlayersManager initialPlayers={players} />;
}
