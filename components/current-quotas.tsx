import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";
import { formatDisplayDate } from "@/lib/utils";

type QuotaRow = {
  id: string;
  name: string;
  currentQuota: number;
  lastRoundPlayed: string;
  lastRoundDate: Date | string | null;
  lastScore: number | null;
  group: string;
  isActive: boolean;
};

export function CurrentQuotas({ rows }: { rows: QuotaRow[] }) {
  return (
    <div className="space-y-4">
      <PageTitle
        title="Current Quotas"
        subtitle="Live quota standings pulled from the latest completed round history."
      />

      {rows.map((row) => (
        <SectionCard key={row.id} className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">{row.name}</h3>
                <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-semibold text-ink/70">
                  {row.group}
                </span>
                {!row.isActive ? (
                  <span className="rounded-full bg-ink/10 px-2.5 py-1 text-xs font-semibold text-ink/55">
                    Inactive
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-ink/70">
                Last round{" "}
                <span className="font-semibold text-ink">
                  {row.lastRoundPlayed}
                  {row.lastRoundDate ? ` | ${formatDisplayDate(row.lastRoundDate)}` : ""}
                </span>
              </p>
              <p className="text-sm text-ink/70">
                Last total{" "}
                <span className="font-semibold text-ink">
                  {row.lastScore === null ? "No rounds yet" : row.lastScore}
                </span>
              </p>
            </div>

            <div className="rounded-[22px] bg-pine px-4 py-3 text-center text-white shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.22em] text-white/75">Quota</p>
              <p className="mt-1 text-2xl font-semibold">{row.currentQuota}</p>
            </div>
          </div>
        </SectionCard>
      ))}
    </div>
  );
}
