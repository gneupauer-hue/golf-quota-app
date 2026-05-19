import { PastRounds } from "@/components/past-rounds";
import { getPastGamesList } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function PastGamesPage() {
  const rounds = await getPastGamesList().catch((error) => {
    console.error("[past-games] Could not load past games", error);
    return [];
  });
  return <PastRounds rounds={rounds} title="Past Games" readOnly />;
}
