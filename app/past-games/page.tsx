import { PastRounds } from "@/components/past-rounds";
import { getPastGamesList } from "@/lib/data";

export default async function PastGamesPage() {
  const rounds = await getPastGamesList();
  return <PastRounds rounds={rounds} title="Past Games" subtitle="Completed rounds archived for review only." readOnly />;
}
