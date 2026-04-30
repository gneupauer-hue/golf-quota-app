import Link from "next/link";
import { ForceClearActiveRound } from "@/components/force-clear-active-round";
import { QuickRoundLauncher } from "@/components/quick-round-launcher";
import { SectionCard } from "@/components/section-card";
import { getHomePageData } from "@/lib/data";

export const dynamic = "force-dynamic";

const actions = [
  {
    href: "/current-round",
    title: "Current Round",
    description: "Open today's round for scorecard entry."
  },
  {
    href: "/past-games",
    title: "Past Games",
    description: "Review completed rounds and results."
  },
  {
    href: "/players",
    title: "Players",
    description: "Manage the roster, conflicts, quotas, and active status."
  }
];

export default async function HomePage() {
  const home = await getHomePageData();
  const currentRoundHref = home.currentRound?.startedAt
    ? "/current-round"
    : home.currentRound
      ? "/round-setup"
      : null;

  return (
    <div className="space-y-3">
      <SectionCard className="space-y-4 border border-pine/20 bg-[#E2F4E6]">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-pine">Current Round</p>
        {home.currentRound && currentRoundHref ? (
          <>
            <div className="space-y-1.5">
              <h3 className="text-2xl font-semibold text-ink">{home.currentRound.roundName}</h3>
              <p className="text-sm text-ink/70">
                {home.currentRound.startedAt
                  ? "Scorecard entry is ready for the active round."
                  : "Finish setup, then start scoring from Current Round."}
              </p>
            </div>
            <Link href={currentRoundHref} className="club-btn-primary min-h-14">
              {home.currentRound.startedAt ? "Open Current Round" : "Continue Setup"}
            </Link>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <h3 className="text-2xl font-semibold text-ink">No active round</h3>
              <p className="text-sm text-ink/70">Start a new scorecard when the group is ready.</p>
            </div>
            <QuickRoundLauncher label="Set Up New Round" />
          </>
        )}
      </SectionCard>

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

      {home.currentRound ? (
        <div className="pt-3">
          <ForceClearActiveRound
            roundId={home.currentRound.id}
            roundName={home.currentRound.roundName}
          />
        </div>
      ) : null}
    </div>
  );
}
