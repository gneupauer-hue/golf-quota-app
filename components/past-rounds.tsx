import Link from "next/link";
import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";
import { formatDisplayDate } from "@/lib/utils";

type RoundSummary = {
  id: string;
  roundName: string;
  roundDate: Date | string;
  isTestRound?: boolean;
  notes: string | null;
  completedAt: Date | string | null;
  entryCount: number;
  leader: {
    name: string;
    plusMinus: number;
  } | null;
};

export function PastRounds({
  rounds,
  title = "Past Rounds",
  subtitle = "Review any saved round, re-open it, and update scores if you need to.",
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
        action={readOnly ? undefined : (
          <Link
            href="/rounds/new"
            className="rounded-2xl bg-pine px-4 py-3 text-sm font-semibold text-white"
          >
            New Round
          </Link>
        )}
      />

      {rounds.map((round) => (
        <SectionCard key={round.id} className="p-4 transition hover:-translate-y-0.5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">{round.roundName}</h3>
                  <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-semibold text-ink/70">
                    {formatDisplayDate(round.roundDate)}
                  </span>
                  {round.isTestRound ? (
                    <span className="rounded-full bg-[#FFF1BF] px-2.5 py-1 text-xs font-semibold text-ink">
                      Test Round
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-ink/70">
                  {round.entryCount} {round.entryCount === 1 ? "player" : "players"}
                </p>
                <p className="text-sm text-ink/70">
                  {round.leader
                    ? `Leader ${round.leader.name} (${round.leader.plusMinus > 0 ? "+" : ""}${round.leader.plusMinus})`
                    : "Not scored yet"}
                </p>
                {round.notes ? <p className="mt-2 text-sm text-ink/65">{round.notes}</p> : null}
              </div>

              <div className="flex flex-col gap-2">
                <Link
                  href={readOnly ? `/rounds/${round.id}/results` : `/rounds/${round.id}`}
                  className="rounded-[20px] bg-ink px-4 py-3 text-center text-sm font-semibold text-white"
                >
                  {readOnly ? "Review" : "Open"}
                </Link>
                <Link
                  href={`/rounds/${round.id}/results`}
                  className="rounded-[20px] bg-pine px-4 py-3 text-center text-sm font-semibold text-white"
                >
                  Scoreboard
                </Link>
              </div>
            </div>
            {readOnly ? (
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">
                Archived game · read only
              </p>
            ) : null}
          </SectionCard>
      ))}
    </div>
  );
}
