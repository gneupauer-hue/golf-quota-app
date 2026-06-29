import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";
import type { SeasonStatsData, SeasonStatsPlayerRow } from "@/lib/season-stats";

function formatMoney(value: number) {
  return `$${Math.floor(value).toLocaleString("en-US")}`;
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
  value
}: {
  title: string;
  rows: SeasonStatsPlayerRow[];
  value: (row: SeasonStatsPlayerRow) => string;
}) {
  return (
    <SectionCard className="space-y-2 p-3">
      <div className="border-b border-maroon/15 pb-2">
        <h3 className="text-lg font-bold text-maroon">{title}</h3>
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
              <span className="font-bold text-ink">{value(row)}</span>
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

      <div className="grid grid-cols-2 gap-2">
        <LeaderCard label="Money Leader" row={data.leaders.money} value={(row) => formatMoney(row.moneyWon)} />
        <LeaderCard label="Birdie Leader" row={data.leaders.birdies} value={(row) => `${row.birdies}`} />
        <LeaderCard label="Skins Leader" row={data.leaders.skins} value={(row) => `${row.paidSkins}`} />
        <LeaderCard label="Indy Leader" row={data.leaders.indy} value={(row) => `${row.indyWins}/${row.indyCashes}`} />
      </div>

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
  );
}
