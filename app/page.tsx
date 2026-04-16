import Link from "next/link";
import { PageTitle } from "@/components/page-title";
import { QuickRoundLauncher } from "@/components/quick-round-launcher";
import { SectionCard } from "@/components/section-card";
import { DemoResetButton } from "@/components/demo-controls";
import { getAppMode } from "@/lib/app-mode";

const actions = [
  {
    href: "/leaderboard",
    title: "Leaderboard",
    description: "Read-only standings, projections, payouts, and skins.",
    tone: "bg-white text-ink"
  },
  {
    href: "/players",
    title: "Players",
    description: "Manage roster, conflicts, quotas, and active status.",
    tone: "bg-white text-ink"
  },
  {
    href: "/past-games",
    title: "Past Games",
    description: "Completed rounds archived for review and edits.",
    tone: "bg-white text-ink"
  }
];

export default async function HomePage() {
  const appMode = getAppMode();

  return (
    <div className="space-y-3">
      <PageTitle
        title="Home"
        subtitle="Compact home base for fast round setup and quick navigation."
      />

      <QuickRoundLauncher />

      {appMode === "demo" ? (
        <SectionCard className="space-y-3 bg-[#FFF1BF]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/55">
              Demo Mode
            </p>
            <h3 className="mt-1 text-lg font-semibold">Safe reset tools</h3>
            <p className="mt-1 text-sm text-ink/70">
              Reset demo rounds, scores, teams, and quotas back to the seeded test state.
            </p>
          </div>
          <DemoResetButton />
        </SectionCard>
      ) : null}

      <div className="flex flex-col gap-3">
        {actions.map((action) => (
          <Link key={action.href} href={action.href} className="block">
            <SectionCard className={`h-auto min-h-0 py-3 ${action.tone}`}>
              <h3 className="text-xl font-semibold tracking-tight">{action.title}</h3>
              <p
                className={`mt-1 text-sm ${
                  action.tone.includes("text-white") ? "text-white/78" : "text-ink/70"
                }`}
              >
                {action.description}
              </p>
            </SectionCard>
          </Link>
        ))}
      </div>
    </div>
  );
}
