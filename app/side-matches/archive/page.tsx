import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";
import { SideMatchesBoard } from "@/components/side-matches-board";
import { getArchivedSideMatchesData } from "@/lib/data";
import { formatDateInput } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ArchivedSideMatchesPage() {
  const rounds = await getArchivedSideMatchesData();

  return (
    <div className="space-y-4">
      <PageTitle
        title="Archived Side Matches"
        subtitle="Past round side matches grouped by completed round."
      />

      {rounds.length ? (
        <div className="space-y-5">
          {rounds.map((item) => (
            <SectionCard key={item.round.id} className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Past Round</p>
                <h3 className="mt-1 text-xl font-semibold text-ink">{item.round.roundName}</h3>
                <p className="mt-1 text-sm text-ink/65">{formatDateInput(item.round.roundDate)}</p>
              </div>
              <SideMatchesBoard
                round={{
                  id: item.round.id,
                  roundName: item.round.roundName,
                  roundDate: item.round.roundDate,
                  roundMode: "MATCH_QUOTA"
                }}
                entries={item.entries}
                sideMatches={item.sideMatches}
                archiveHref="/side-matches/archive"
                readOnly
                showHeader={false}
                showArchiveLink={false}
              />
            </SectionCard>
          ))}
        </div>
      ) : (
        <SectionCard className="space-y-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
            No Archived Side Matches
          </p>
          <p className="text-sm text-ink/65">
            Completed rounds with side matches will appear here once they move out of the live Side Matches tab.
          </p>
        </SectionCard>
      )}
    </div>
  );
}
