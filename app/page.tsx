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
    description: "Read-only standings, projections, payouts, and skins."
  },
  {
    href: "/current-round",
    title: "Current Round",
    description: "Open the one live round for setup, teams, and score entry."
  },
  {
    href: "/players",
    title: "Players",
    description: "Manage roster, conflicts, quotas, and active status."
  },
  {
    href: "/past-games",
    title: "Past Games",
    description: "Completed rounds archived for read-only review."
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
            <SectionCard className="h-auto min-h-0 py-4">
              <h3 className="text-xl font-bold tracking-tight text-ink">{action.title}</h3>
              <p className="mt-1 text-sm font-medium text-ink/80">{action.description}</p>
            </SectionCard>
          </Link>
        ))}
      </div>
    </div>
  );
}
