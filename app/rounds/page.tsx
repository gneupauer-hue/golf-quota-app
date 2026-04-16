import { PastRounds } from "@/components/past-rounds";
import { getRoundsList } from "@/lib/data";

export default async function PastRoundsPage() {
  const rounds = await getRoundsList();
  return <PastRounds rounds={rounds} />;
}
