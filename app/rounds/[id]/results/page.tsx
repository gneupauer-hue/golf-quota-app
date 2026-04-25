import { notFound } from "next/navigation";
import { RoundResults } from "@/components/round-results";
import { getRoundResultsData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function RoundResultsPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getRoundResultsData(id);

  if (!data) {
    notFound();
  }

  return <RoundResults data={data} />;
}
