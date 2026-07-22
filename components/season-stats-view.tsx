import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";
import {
  SEASON_STATS_MIN_RATE_ROUNDS,
  type SeasonStatsData,
  type SeasonStatsPlayerRow
} from "@/lib/season-stats";

function formatMoney(value: number) {
  return `$${Math.floor(value).toLocaleString("en-US")}`;
}

function formatMoneyRate(value: number) {
  return `$${value.toFixed(2)} / round`;
}

function formatNumberRate(value: number, label: string) {
  return `${value.toFixed(1)} ${label} / round`;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function LeaderCard({
  label,
  row,
  value
}: {
  label: string;
  row: SeasonStatsPlayerRow | null;
  value: (row: SeasonStatsPlayerRow) => string;
}) {
  return (
    <SectionCard className="space-y-1.5 p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-maroon/75">{label}</p>
      <p className="truncate text-base font-bold text-ink">{row?.playerName ?? "No rounds yet"}</p>
      <p className="text-sm font-bold text-maroon">{row ? value(row) : "-"}</p>
    </SectionCard>
  );
}

type BreakdownItem = { label: string; value: string };

function roundLabel(contribution: SeasonStatsPlayerRow["roundContributions"][number]) {
  if (contribution.roundName?.trim()) {
    return contribution.roundName;
  }
  const date = contribution.roundDate instanceof Date ? contribution.roundDate : new Date(contribution.roundDate);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Build the per-round breakdown for one stat: valueFor returns the displayed
// value for a round, or null to omit that round.
function roundBreakdown(
  row: SeasonStatsPlayerRow,
  valueFor: (contribution: SeasonStatsPlayerRow["roundContributions"][number]) => string | null
): BreakdownItem[] {
  return row.roundContributions
    .slice()
    .sort((left, right) => new Date(left.roundDate).getTime() - new Date(right.roundDate).getTime())
    .map((contribution) => {
      const value = valueFor(contribution);
      return value == null ? null : { label: roundLabel(contribution), value };
    })
    .filter((item): item is BreakdownItem => item !== null);
}

function LeaderboardSection({
  title,
  rows,
  value,
  note,
  breakdown
}: {
  title: string;
  rows: SeasonStatsPlayerRow[];
  value: (row: SeasonStatsPlayerRow) => string;
  note?: string;
  breakdown?: (row: SeasonStatsPlayerRow) => BreakdownItem[];
}) {
  return (
    <SectionCard className="space-y-2 p-3">
      <div className="border-b border-maroon/15 pb-2">
        <h3 className="text-lg font-bold text-maroon">{title}</h3>
        {note ? <p className="mt-1 text-xs font-medium text-ink/60">{note}</p> : null}
      </div>
      {rows.length ? (
        <div className="divide-y divide-maroon/10">
          {rows.map((row, index) => {
            const items = breakdown ? breakdown(row) : [];
            if (items.length) {
              return (
                <details key={row.playerId} className="group py-1">
                  <summary className="grid cursor-pointer list-none grid-cols-[2rem_1fr_auto_1rem] items-center gap-2 py-1 text-sm [&::-webkit-details-marker]:hidden">
                    <span className="font-bold text-maroon">{index + 1}.</span>
                    <span className="min-w-0 truncate font-semibold text-ink">{row.playerName}</span>
                    <span className="text-right font-bold text-ink">{value(row)}</span>
                    <span className="text-right text-xs text-ink/40 transition-transform group-open:rotate-90" aria-hidden="true">
                      ▸
                    </span>
                  </summary>
                  <div className="mb-1 mt-1 space-y-1 rounded-xl bg-canvas px-3 py-2">
                    {items.map((item, itemIndex) => (
                      <div key={itemIndex} className="flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate text-ink/70">{item.label}</span>
                        <span className="font-semibold text-ink/85">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </details>
              );
            }
            return (
              <div
                key={row.playerId}
                className="grid grid-cols-[2rem_1fr_auto_1rem] items-center gap-2 py-2 text-sm"
              >
                <span className="font-bold text-maroon">{index + 1}.</span>
                <span className="min-w-0 truncate font-semibold text-ink">{row.playerName}</span>
                <span className="text-right font-bold text-ink">{value(row)}</span>
                <span aria-hidden="true" />
              </div>
            );
          })}
        </div>
      ) : (
        <p className="py-2 text-sm font-medium text-ink/65">No season stats yet.</p>
      )}
    </SectionCard>
  );
}

export function SeasonStatsView({ data }: { data: SeasonStatsData }) {
  const hasStats = data.roundsCount > 0;
  const rateNote = `Rate stats require at least ${SEASON_STATS_MIN_RATE_ROUNDS} rounds played.`;

  return (
    <div className="space-y-3">
      <PageTitle
        title={`${data.seasonYear} Season Stats`}
        subtitle="Read-only leaderboards from finalized real rounds only."
      />

      {!hasStats ? (
        <SectionCard>
          <p className="text-sm font-semibold text-ink/75">No season stats yet.</p>
        </SectionCard>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-xl font-bold text-maroon">Season Leaders</h3>
        <div className="grid grid-cols-2 gap-2">
          <LeaderCard label="Money Leader" row={data.leaders.money} value={(row) => formatMoney(row.moneyWon)} />
          <LeaderCard label="Birdie Leader" row={data.leaders.birdies} value={(row) => `${row.birdies}`} />
          <LeaderCard label="Skins Leader" row={data.leaders.skins} value={(row) => `${row.paidSkins}`} />
          <LeaderCard label="Indy Leader" row={data.leaders.indy} value={(row) => `${row.indyWins}/${row.indyCashes}`} />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xl font-bold text-maroon">Total Stats</h3>
        <LeaderboardSection
          title="Money Won"
          rows={data.leaderboards.moneyWon}
          value={(row) => formatMoney(row.moneyWon)}
          breakdown={(row) => roundBreakdown(row, (c) => (c.moneyWon > 0 ? formatMoney(c.moneyWon) : null))}
        />
        <LeaderboardSection
          title="Birdies"
          rows={data.leaderboards.birdies}
          value={(row) => `${row.birdies}`}
          breakdown={(row) => roundBreakdown(row, (c) => (c.birdies > 0 ? `${c.birdies}` : null))}
        />
        <LeaderboardSection
          title="Eagles"
          rows={data.leaderboards.eagles}
          value={(row) => `${row.eagles}`}
          breakdown={(row) => roundBreakdown(row, (c) => (c.eagles > 0 ? `${c.eagles}` : null))}
        />
        <LeaderboardSection
          title="Albatrosses"
          rows={data.leaderboards.albatrosses}
          value={(row) => `${row.albatrosses}`}
          breakdown={(row) => roundBreakdown(row, (c) => (c.albatrosses > 0 ? `${c.albatrosses}` : null))}
        />
        <LeaderboardSection
          title="Hole-in-Ones"
          rows={data.leaderboards.hios}
          value={(row) => `${row.hios}`}
          breakdown={(row) => roundBreakdown(row, (c) => (c.hios > 0 ? `${c.hios}` : null))}
        />
        <LeaderboardSection
          title="Paid Skins"
          rows={data.leaderboards.paidSkins}
          value={(row) => `${row.paidSkins}`}
          breakdown={(row) => roundBreakdown(row, (c) => (c.paidSkins > 0 ? `${c.paidSkins}` : null))}
        />
        <LeaderboardSection
          title="Individual Quota"
          rows={data.leaderboards.individualQuota}
          value={(row) => `${row.indyWins} wins / ${row.indyCashes} cashes`}
          breakdown={(row) =>
            roundBreakdown(row, (c) => (c.indyCashes > 0 ? (c.indyWins > 0 ? "Win" : "Cash") : null))
          }
        />
        <LeaderboardSection
          title="Team Events"
          rows={data.leaderboards.teamEvents}
          value={(row) => `${row.teamEvents}`}
          breakdown={(row) => roundBreakdown(row, (c) => (c.teamEvents > 0 ? `${c.teamEvents}` : null))}
        />
      </div>

      <div className="space-y-2">
        <h3 className="text-xl font-bold text-maroon">Per-Round Stats</h3>
        <p className="text-sm font-medium text-ink/65">{rateNote}</p>
        <LeaderboardSection
          title="Money per Round"
          rows={data.rateLeaderboards.moneyPerRound}
          value={(row) => `${formatMoneyRate(row.moneyPerRound)} - ${row.roundsPlayed} rounds`}
        />
        <LeaderboardSection
          title="Birdies per Round"
          rows={data.rateLeaderboards.birdiesPerRound}
          value={(row) => `${formatNumberRate(row.birdiesPerRound, "birdies")} - ${row.roundsPlayed} rounds`}
        />
        <LeaderboardSection
          title="Paid Skins per Round"
          rows={data.rateLeaderboards.paidSkinsPerRound}
          value={(row) => `${formatNumberRate(row.paidSkinsPerRound, "skins")} - ${row.roundsPlayed} rounds`}
        />
        <LeaderboardSection
          title="Indy Cash Rate"
          rows={data.rateLeaderboards.indyCashRate}
          value={(row) => `${formatPercent(row.indyCashRate)} - ${row.roundsPlayed} rounds`}
        />
        <LeaderboardSection
          title="Team Cash Rate"
          rows={data.rateLeaderboards.teamCashRate}
          value={(row) => `${formatPercent(row.teamCashRate)} - ${row.roundsPlayed} rounds`}
        />
      </div>

      <div className="space-y-2">
        <h3 className="text-xl font-bold text-maroon">Rounds Played</h3>
        <LeaderboardSection
          title="Rounds Played"
          rows={data.leaderboards.roundsPlayed}
          value={(row) => `${row.roundsPlayed}`}
          breakdown={(row) => roundBreakdown(row, () => "Played")}
        />
      </div>
    </div>
  );
}
