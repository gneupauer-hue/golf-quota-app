import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";

type BaselineQuotaRow = {
  playerName: string;
  baselineQuota: number;
};

export function CurrentQuotas({ rows }: { rows: BaselineQuotaRow[] }) {
  return (
    <div className="space-y-4">
      <PageTitle
        title="2026 Starting Quotas"
        subtitle="Locked baseline quotas used to rebuild the season from the April 19, 2026 starting point."
      />

      <SectionCard className="p-4">
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.playerName}
              className="flex items-center justify-between rounded-2xl border border-mist bg-white px-4 py-3"
            >
              <p className="text-sm font-semibold text-ink">{row.playerName}</p>
              <span className="rounded-full bg-pine px-3 py-1 text-sm font-bold text-white">
                {row.baselineQuota}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
