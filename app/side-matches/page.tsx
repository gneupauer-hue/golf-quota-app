import { SideMatchesBoard } from "@/components/side-matches-board";
import { getActiveSideMatchesData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function SideMatchesPage() {
  const data = await getActiveSideMatchesData();

  return (
    <SideMatchesBoard
      round={data?.round ?? null}
      entries={data?.entries ?? []}
      sideMatches={data?.sideMatches ?? []}
      archiveHref="/side-matches/archive"
    />
  );
}
