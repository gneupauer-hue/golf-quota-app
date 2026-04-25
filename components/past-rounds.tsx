import Link from "next/link";
import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";
import { formatDisplayDate, getRoundDisplayDate, getRoundDisplayName } from "@/lib/utils";

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

function formatModeLabel(roundMode?: "MATCH_QUOTA" | "SKINS_ONLY") {
  if (roundMode === "SKINS_ONLY") {
    return "Skins Only";
  }

  return "Match + Quota";
}

function formatLeaderLabel(leader: RoundSummary["leader"]) {
  if (!leader) {
    return "Not scored yet";
  }

  return `Leader ${leader.name} (${leader.plusMinus > 0 ? "+" : ""}${leader.plusMinus})`;
}

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
            <SectionCard key={round.id} className="p-4 transition hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-grove px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
                      {getRoundDisplayName({
                      roundName: round.roundName,
                      roundDate: round.roundDate,
                      completedAt: round.completedAt,
                      createdAt: round.createdAt
                    })}
                    </span>
                    <span className="club-pill">{formatDisplayDate(
                      getRoundDisplayDate({
                        roundName: round.roundName,
                        roundDate: round.roundDate,
                        completedAt: round.completedAt,
                        createdAt: round.createdAt
                      })
                    )}</span>
                    <span className="club-pill">{formatModeLabel(round.roundMode)}</span>
                    <span className="club-pill">
                      {round.entryCount} {round.entryCount === 1 ? "player" : "players"}
                    </span>
                    {round.teamCount ? <span className="club-pill">{round.teamCount} teams</span> : null}
                    {readOnly ? (
                      <span className="rounded-full bg-[#EAF6EC] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-pine">
                        Final
                      </span>
                    ) : null}
                    {round.isPayoutLocked ? (
                      <span className="rounded-full bg-card px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/75">
                        Locked
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 rounded-[22px] border border-ink/10 bg-canvas px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink/45">
                          Round Summary
                        </p>
                        <p className="mt-1 text-base font-semibold text-ink">
                          {formatLeaderLabel(round.leader)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink/45">
                          Completed
                        </p>
                        <p className="mt-1 text-sm font-semibold text-ink">
                          {round.completedAt ? formatDisplayDate(round.completedAt) : "Archived"}
                        </p>
                      </div>
                    </div>
                    {round.notes ? <p className="mt-3 text-sm text-ink/65">{round.notes}</p> : null}
                  </div>
                </div>

                <div className="flex w-[120px] shrink-0 flex-col gap-2 sm:w-[132px]">
                  <Link
                    href={`/rounds/${round.id}/results`}
                    className="club-btn-primary w-full rounded-[20px] text-center"
                  >
                    Review
                  </Link>
                  {!readOnly ? (
                    <Link
                      href={`/rounds/${round.id}`}
                      className="club-btn-secondary w-full rounded-[20px] text-center"
                    >
                      Open
                    </Link>
                  ) : null}
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

