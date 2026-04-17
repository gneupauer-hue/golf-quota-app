import Link from "next/link";
import { LeaderboardPayoutPredictions } from "@/components/leaderboard-payout-predictions";
import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";
import { getLeaderboardPageData } from "@/lib/data";
import {
  calculateIndividualPayoutProjection,
  calculatePayoutPredictions,
  formatPlusMinus
} from "@/lib/quota";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2
  }).format(value);
}

function getSkinResultLabel(score: number | null | undefined) {
  if (score === 6) return "Eagle";
  if (score === 4) return "Birdie";
  return null;
}

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const data = await getLeaderboardPageData();

  if (!data) {
    return (
      <div className="space-y-3">
        <PageTitle title="Leaderboard" subtitle="Live standings and projections for the current round." />
        <SectionCard className="space-y-3">
          <h3 className="text-lg font-semibold">No current round</h3>
          <p className="text-sm text-ink/65">
            Start a round to see live team leaders, individual projections, and skins updates.
          </p>
          <Link href="/rounds/new" className="club-btn-primary min-h-12">
            New Round
          </Link>
        </SectionCard>
      </div>
    );
  }

  const isSkinsOnly = data.round.roundMode === "SKINS_ONLY";
  const individualPayoutProjection = isSkinsOnly
    ? []
    : calculateIndividualPayoutProjection(data.entries);
  const payoutPredictions = calculatePayoutPredictions(data.entries, {
    includeTeamPayouts: !isSkinsOnly,
    includeIndividualPayouts: !isSkinsOnly,
    includeSkinsPayouts: true
  });
  const reconciliationRows = [
    {
      key: "front",
      label: "Front paid",
      allocated: payoutPredictions.frontProjectedTotal + payoutPredictions.frontBarRemainder,
      pot: payoutPredictions.frontPot,
      difference: payoutPredictions.frontDifference,
      bar: payoutPredictions.frontBarRemainder
    },
    {
      key: "back",
      label: "Back paid",
      allocated: payoutPredictions.backProjectedTotal + payoutPredictions.backBarRemainder,
      pot: payoutPredictions.backPot,
      difference: payoutPredictions.backDifference,
      bar: payoutPredictions.backBarRemainder
    },
    {
      key: "total",
      label: "Total paid",
      allocated: payoutPredictions.totalProjectedTotal + payoutPredictions.totalBarRemainder,
      pot: payoutPredictions.totalPot,
      difference: payoutPredictions.totalDifference,
      bar: payoutPredictions.totalBarRemainder
    },
    {
      key: "indy",
      label: "Indy paid",
      allocated: payoutPredictions.indyProjectedTotal + payoutPredictions.indyBarRemainder,
      pot: payoutPredictions.indyPot,
      difference: payoutPredictions.indyDifference,
      bar: payoutPredictions.indyBarRemainder
    },
    {
      key: "skins",
      label: "Skins paid",
      allocated: payoutPredictions.skinsProjectedTotal + payoutPredictions.skinsBarRemainder,
      pot: payoutPredictions.skinsPot,
      difference: payoutPredictions.skinsDifference,
      bar: payoutPredictions.skinsBarRemainder
    },
    {
      key: "overall",
      label: "Overall allocated",
      allocated: payoutPredictions.projectedPayoutTotal + payoutPredictions.barRemainder,
      pot: payoutPredictions.overallPot,
      difference: payoutPredictions.overallDifference,
      bar: payoutPredictions.barRemainder
    }
  ] as const;
  const awardedSkins = data.money.skins.holes
    .filter((hole) => hole.skinAwarded && hole.winnerPlayerId)
    .map((hole) => {
      const winner = data.entries.find(
        (entry: (typeof data.entries)[number]) => entry.playerId === hole.winnerPlayerId
      );
      const resultLabel = getSkinResultLabel(winner?.holeScores[hole.holeNumber - 1]) ?? "Birdie";

      return {
        holeNumber: hole.holeNumber,
        winnerName: hole.winnerName ?? winner?.playerName ?? "-",
        resultLabel,
        value: data.money.skins.valuePerSkin * hole.sharesCaptured
      };
    });

  return (
    <div className="space-y-3">
      <PageTitle
        title="Leaderboard"
        subtitle={
          isSkinsOnly
            ? `${data.round.roundName} skins-only view`
            : `${data.round.roundName} live standings and projections`
        }
        action={
          <Link href={`/rounds/${data.round.id}`} className="club-btn-primary">
            Open Round
          </Link>
        }
      />

      <section className="club-panel-dark space-y-3 px-4 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/80">
            Projections
          </p>
          <h3 className="mt-1 text-xl font-semibold">
            {isSkinsOnly ? "Live skins and current winners" : "Estimated win chances"}
          </h3>
          <p className="mt-1 text-xs text-white/80">
            Estimates based on current margins and holes remaining.
          </p>
        </div>
        <div className="space-y-2">
          {!isSkinsOnly
            ? [
                { label: "Front", projection: data.projections.frontTeam },
                { label: "Back", projection: data.projections.backTeam },
                { label: "Total", projection: data.projections.totalTeam }
              ].map((item) => (
                <div key={item.label} className="rounded-2xl bg-white/10 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-white/75">
                        {item.label}
                      </p>
                      <p className="mt-1 text-lg font-semibold">
                        {item.projection?.leaderLabel ?? "-"}
                      </p>
                      {item.projection ? (
                        <p className="mt-1 text-xs text-white/80">{`Margin ${formatPlusMinus(item.projection.margin)} | ${item.projection.holesRemaining} holes left`}</p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-semibold">
                        {item.projection ? `${item.projection.probability}%` : "-"}
                      </p>
                      <p className="mt-1 text-xs text-white/80">Win Probability</p>
                    </div>
                  </div>
                  {item.projection ? (
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[#FFF1BF]"
                        style={{ width: `${item.projection.probability}%` }}
                      />
                    </div>
                  ) : null}
                </div>
              ))
            : null}

          {!isSkinsOnly ? (
            <div className="rounded-2xl bg-white/10 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/75">
                    Individual Payout Projection
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {individualPayoutProjection.length
                      ? `${individualPayoutProjection.length} paid spot${individualPayoutProjection.length === 1 ? "" : "s"} projected`
                      : "No paid spots projected yet"}
                  </p>
                  <p className="mt-1 text-xs text-white/80">
                    Paid places and dollars come directly from the fixed payout table for
                    this field size.
                  </p>
                </div>
                <div className="rounded-full bg-white/12 px-3 py-1.5 text-sm font-semibold text-white">
                  {formatCurrency(data.money.overallPot.indyPot)}
                </div>
              </div>

              {individualPayoutProjection.length ? (
                <div className="mt-3 space-y-2">
                  {individualPayoutProjection.map((spot) => (
                    <div
                      key={spot.place}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-white/12 px-3 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {`${spot.placeLabel} - ${spot.playerName}`}
                        </p>
                        <p className="mt-1 text-xs text-white/82">
                          {`${spot.probability}% | Margin ${formatPlusMinus(spot.margin)} | ${spot.holesRemaining} hole${spot.holesRemaining === 1 ? "" : "s"} left`}
                        </p>
                      </div>
                      <p className="text-base font-bold text-[#F3E2BC]">
                        {formatCurrency(spot.payout)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-2xl bg-white/12 px-3 py-3">
                  <p className="text-sm font-semibold text-white">No paid spots projected yet</p>
                </div>
              )}
            </div>
          ) : null}

          <div className="rounded-2xl bg-white/10 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/75">
                  Current Good Skins
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {awardedSkins.length
                    ? `${awardedSkins.length} good skin${awardedSkins.length === 1 ? "" : "s"} currently in play`
                    : "No good skins yet"}
                </p>
                <p className="mt-1 text-xs text-white/80">
                  {awardedSkins.length
                    ? data.money.skins.valuePerSkin > 0
                      ? `Current skin value ${formatCurrency(data.money.skins.valuePerSkin)} per winning share`
                      : "Winning skin value updates as carryovers resolve."
                    : data.money.skins.currentCarryoverCount
                      ? `${data.money.skins.currentCarryoverCount} carryover hole${data.money.skins.currentCarryoverCount === 1 ? "" : "s"} live`
                      : "No outright skins have been won yet."}
                </p>
              </div>
              <div className="rounded-full bg-white/12 px-3 py-1.5 text-sm font-semibold text-white">
                {formatCurrency(data.money.skins.totalPot)}
              </div>
            </div>

            {awardedSkins.length ? (
              <div className="mt-3 space-y-2">
                {awardedSkins.map((skin) => (
                  <div
                    key={`${skin.holeNumber}-${skin.winnerName}`}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-white/12 px-3 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">{`Hole ${skin.holeNumber} - ${skin.winnerName}`}</p>
                      <p className="mt-1 text-xs font-medium text-white/88">{skin.resultLabel}</p>
                    </div>
                    <p className="text-base font-bold text-[#F3E2BC]">
                      {formatCurrency(skin.value)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-2xl bg-white/12 px-3 py-3">
                <p className="text-sm font-semibold text-white">No good skins yet</p>
                <p className="mt-1 text-xs text-white/80">
                  {data.money.skins.currentCarryoverCount
                    ? `Carryover: ${data.money.skins.currentCarryoverCount} hole${data.money.skins.currentCarryoverCount === 1 ? "" : "s"}`
                    : "Birdies or better will appear here once an outright winning hole is recorded."}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <SectionCard className="space-y-3">
        <LeaderboardPayoutPredictions
          roundId={data.round.id}
          isPayoutLocked={Boolean(data.round.isPayoutLocked)}
          initialPaidPlayerIds={data.round.paidPlayerIds ?? []}
          players={payoutPredictions.players}
          barRemainder={payoutPredictions.barRemainder}
          moneyCurrentlyInPlay={payoutPredictions.moneyCurrentlyInPlay}
          unsettledSkinsValue={payoutPredictions.unsettledSkinsValue}
          isBalanced={payoutPredictions.isBalanced}
          mismatchedCategories={payoutPredictions.mismatchedCategories}
          reconciliationRows={reconciliationRows}
        />
      </SectionCard>
    </div>
  );
}
