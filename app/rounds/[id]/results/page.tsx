import { RoundResults } from "@/components/round-results";
import { SideMatchesBoard } from "@/components/side-matches-board";
import { DeleteTestRoundButton } from "@/components/delete-test-round-button";
import { SectionCard } from "@/components/section-card";
import { getRoundEditorData, getRoundResultsData, getRoundSideMatches } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function RoundResultsPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getRoundResultsData(id).catch((error) => {
    console.error("[results] Could not load round results", { id, error });
    return null;
  });
  const sideMatches = await getRoundSideMatches(id).catch(() => []);
  const editorData = await getRoundEditorData(id).catch(() => null);

  if (!data) {
    return (
      <SectionCard className="space-y-2 border border-danger/20 bg-[#FCE5E2]">
        <h3 className="text-base font-semibold text-danger">Results temporarily unavailable</h3>
        <p className="text-sm text-ink/75">Refresh in a moment. The page is protected from crashing while the database recovers.</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      <RoundResults data={data} />
      {editorData && sideMatches.length ? (
        <SideMatchesBoard
          round={{
            id: editorData.round.id,
            roundName: editorData.round.roundName,
            roundDate: editorData.round.roundDate,
            roundMode: editorData.round.roundMode
          }}
          entries={editorData.round.entries}
          sideMatches={sideMatches}
          archiveHref="/side-matches/archive"
          readOnly
          showHeader={false}
          showArchiveLink={false}
          autoRefresh={false}
        />
      ) : null}
      {editorData?.round.isTestRound ? <DeleteTestRoundButton roundId={id} /> : null}
    </div>
  );
}
