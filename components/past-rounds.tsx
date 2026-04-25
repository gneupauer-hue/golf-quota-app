import Link from "next/link";
import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";
import { formatDisplayDate } from "@/lib/utils";

type RoundSummary = {
  id: string;
  roundName: string;
  roundDate: Date | string;
  roundMode?: "MATCH_QUOTA" | "SKINS_ONLY";
  createdAt?: Date | string | null;
  isTestRound?: boolean;
  notes: string | null;
  completedAt: Date | string | null;
  entryCount: number;
  teamCount?: number | null;
  isPayoutLocked?: boolean;
  leader: {
    name: string;
    plusMinus: number;
  } | null;
};

export function PastRounds({
  rounds,
  title = "Past Rounds",
  subtitle = "Review completed rounds and reopen full results.",
  readOnly = false
}: {
  rounds: RoundSummary[];
  title?: string;
  subtitle?: string;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-4">
      <PageTitle
        title={title}
        subtitle={subtitle}
        action={
          readOnly ? undefined : (
            <Link href="/round-setup" className="club-btn-primary">
              Round Setup
            </Link>
          )
        }
      />

      {rounds.length ? (
        <div className="space-y-3">
          {rounds.map((round) => (
            <SectionCard key={round.id} className="p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-ink">
                    {round.completedAt ? formatDisplayDate(round.completedAt) : "Archived"}
                  </p>
                </div>

                <div className="shrink-0">
                  <Link
                    href={`/rounds/${round.id}/results`}
                    className="club-btn-primary rounded-[18px] px-4 text-center text-sm"
                  >
                    Review
                  </Link>
                </div>
              </div>
            </SectionCard>
          ))}
        </div>
      ) : (
        <SectionCard className="p-5">
          <p className="text-lg font-semibold text-ink">No past rounds yet.</p>
          <p className="mt-2 text-sm text-ink/65">
            Completed rounds will appear here once a round is archived.
          </p>
        </SectionCard>
      )}
    </div>
  );
}
