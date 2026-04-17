import { SeasonStats } from "@/components/season-stats";
import { getSeasonStatsData, type SeasonStatsSort } from "@/lib/data";

export const dynamic = "force-dynamic";

function parseSort(value: string | undefined): SeasonStatsSort {
  if (value === "improved" || value === "rounds" || value === "quota") {
    return value;
  }

  return "net";
}

export default async function SeasonStatsPage({
  searchParams
}: {
  searchParams?: Promise<{ sort?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const data = await getSeasonStatsData(parseSort(params?.sort));

  return <SeasonStats data={data} />;
}
