import { PastRounds } from "@/components/past-rounds";
import { getPastGamesList } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function PastGamesPage() {
  const rounds = await getPastGamesList();
  return <PastRounds rounds={rounds} title="Past Games" readOnly />;
}
