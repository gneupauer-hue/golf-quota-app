import Link from "next/link";
import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";
import { getLeaderboardPageData } from "@/lib/data";
import { formatPlusMinus } from "@/lib/quota";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const data = await getLeaderboardPageData();

  if (!data) {
    return (
      <div className="space-y-3">
        <PageTitle title="Leaderboard" subtitle="Live standings and projections for the current round." />
        <SectionCard className="space-y-3">
          <h3 className="text-lg font-semibold">No current round</h3>
          <p className="text-sm text-ink/65">Start a round to see live team leaders, individual projections, and skins updates.</p>
          <Link href="/rounds/new" className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white">
            New Round
          </Link>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PageTitle
        title="Leaderboard"
        subtitle={`${data.round.roundName} live standings and projections`}
        action={
          <Link href={`/rounds/${data.round.id}`} className="rounded-2xl bg-pine px-4 py-3 text-sm font-semibold text-white">
            Open Round
          </Link>
        }
      />

      <section className="space-y-3 rounded-[24px] border border-white/10 bg-ink px-4 py-3 text-white shadow-card">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/80">Projections</p>
          <h3 className="mt-1 text-xl font-semibold">Estimated win chances</h3>
          <p className="mt-1 text-xs text-white/80">
            Estimates based on current margins and holes remaining.
          </p>
        </div>
        <div className="space-y-2">
          {[
            { label: "Front", projection: data.projections.frontTeam },
            { label: "Back", projection: data.projections.backTeam },
            { label: "Total", projection: data.projections.totalTeam },
            { label: "Individual", projection: data.projections.individual }
          ].map((item) => (
            <div key={item.label} className="rounded-2xl bg-white/10 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/75">{item.label}</p>
                  <p className="mt-1 text-lg font-semibold">{item.projection?.leaderLabel ?? "-"}</p>
                  {item.projection ? (
                    <p className="mt-1 text-xs text-white/80">{`Margin ${formatPlusMinus(item.projection.margin)} | ${item.projection.holesRemaining} holes left`}</p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold">{item.projection ? `${item.projection.probability}%` : "-"}</p>
                  <p className="mt-1 text-xs text-white/80">Win Probability</p>
                </div>
              </div>
              {item.projection ? (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[#FFF1BF]"
                    style={{ width: `${item.projection.probability}%` }}
                  />
                </div>
              ) : null}
            </div>
          ))}
          <div className="rounded-2xl bg-white/10 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/75">Skins Projection</p>
                <p className="mt-1 text-lg font-semibold">{data.projections.skins.heading}</p>
                <p className="mt-1 text-xs text-white/80">{data.projections.skins.detail}</p>
              </div>
              <p className="text-xl font-semibold">
                {data.projections.skins.probability == null ? "Live" : `${data.projections.skins.probability}%`}
              </p>
            </div>
            {data.projections.skins.probability != null ? (
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[#FFF1BF]"
                  style={{ width: `${data.projections.skins.probability}%` }}
                />
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
