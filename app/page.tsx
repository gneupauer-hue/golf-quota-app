import Link from "next/link";
import { ForceClearActiveRound } from "@/components/force-clear-active-round";
import { PageTitle } from "@/components/page-title";
import { QuickRoundLauncher } from "@/components/quick-round-launcher";
import { SectionCard } from "@/components/section-card";
import { getHomePageData } from "@/lib/data";

const actions = [
  {
    href: "/leaderboard",
    title: "Leaderboard",
    description: "Read-only standings, projections, payouts, and skins.",
    tone: "bg-white text-ink"
  },
  {
    href: "/current-round",
    title: "Current Round",
    description: "Open the one live round for setup, teams, and score entry.",
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
    description: "Completed rounds archived for read-only review.",
    tone: "bg-white text-ink"
  }
];

export default async function HomePage() {
  const home = await getHomePageData();

  return (
    <div className="space-y-3">
      <PageTitle
        title="Home"
        subtitle="Compact home base for fast round setup and quick navigation."
      />

      <QuickRoundLauncher />

      {home.currentRound ? (
        <ForceClearActiveRound
          roundId={home.currentRound.id}
          roundName={home.currentRound.roundName}
        />
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
