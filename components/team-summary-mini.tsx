import { formatPlusMinus } from "@/lib/quota";
import { classNames } from "@/lib/utils";

export function TeamSummaryMini({
  frontPoints,
  backPoints,
  totalPoints,
  totalQuota,
  totalPlusMinus
}: {
  frontPoints: number;
  backPoints: number;
  totalPoints: number;
  totalQuota: number;
  totalPlusMinus: number;
}) {
  const totalNegative = totalPlusMinus < 0;

  return (
    <div className="rounded-[24px] border border-ink/10 bg-canvas p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ink/45">
        Team Summary
      </p>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {[
          { label: "Front", value: frontPoints },
          { label: "Back", value: backPoints },
          { label: "Total", value: totalPoints },
          { label: "Quota", value: totalQuota }
        ].map((item) => (
          <div key={item.label} className="rounded-2xl bg-white px-3 py-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">{item.label}</p>
            <p className="mt-1 text-lg font-semibold">{item.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-2 rounded-2xl bg-white px-3 py-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Points vs Quota</p>
        <p className={classNames("mt-1 text-2xl font-semibold", totalNegative ? "text-danger" : "text-pine")}>
          {formatPlusMinus(totalPlusMinus)}
        </p>
      </div>
    </div>
  );
}
