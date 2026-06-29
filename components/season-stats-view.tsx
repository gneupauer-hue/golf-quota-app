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

function LeaderboardSection({
  title,
  rows,
  value,
  note
}: {
  title: string;
  rows: SeasonStatsPlayerRow[];
  value: (row: SeasonStatsPlayerRow) => string;
  note?: string;
}) {
  return (
    <SectionCard className="space-y-2 p-3">
      <div className="border-b border-maroon/15 pb-2">
        <h3 className="text-lg font-bold text-maroon">{title}</h3>
        {note ? <p className="mt-1 text-xs font-medium text-ink/60">{note}</p> : null}
      </div>
      {rows.length ? (
        <div className="divide-y divide-maroon/10">
          {rows.map((row, index) => (
            <div
              key={row.playerId}
              className="grid grid-cols-[2rem_1fr_auto] items-center gap-2 py-2 text-sm"
            >
              <span className="font-bold text-maroon">{index + 1}.</span>
              <span className="min-w-0 truncate font-semibold text-ink">{row.playerName}</span>
              <span className="text-right font-bold text-ink">{value(row)}</span>
            </div>
          ))}
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
        />
        <LeaderboardSection
          title="Birdies"
          rows={data.leaderboards.birdies}
          value={(row) => `${row.birdies}`}
        />
        <LeaderboardSection
          title="Eagles"
          rows={data.leaderboards.eagles}
          value={(row) => `${row.eagles}`}
        />
        <LeaderboardSection
          title="Hole-in-Ones"
          rows={data.leaderboards.hios}
          value={(row) => `${row.hios}`}
        />
        <LeaderboardSection
          title="Paid Skins"
          rows={data.leaderboards.paidSkins}
          value={(row) => `${row.paidSkins}`}
        />
        <LeaderboardSection
          title="Individual Quota"
          rows={data.leaderboards.individualQuota}
          value={(row) => `${row.indyWins} wins / ${row.indyCashes} cashes`}
        />
        <LeaderboardSection
          title="Team Events"
          rows={data.leaderboards.teamEvents}
          value={(row) => `${row.teamEvents}`}
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
        />
      </div>
    </div>
  );
}
