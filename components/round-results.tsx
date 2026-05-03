"use client";

import Link from "next/link";
import { useState } from "react";
import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";
import type { QuotaValidationSummary } from "@/lib/quota-history";
import {
  calculatePayoutAudit,
  calculateFinalPayoutSummary,
  formatPayoutAuditStatus,
  formatPlusMinus,
  goodSkinTypeLabels,
  type GoodSkinEntry,
  type TeamCode
} from "@/lib/quota";
import { classNames, formatDisplayDate, getRoundDisplayDate } from "@/lib/utils";

type ResultsData = {
  round: {
    id: string;
    roundName: string;
    roundDate: Date | string;
    roundMode: "MATCH_QUOTA" | "SKINS_ONLY";
    isPayoutLocked: boolean;
    paidPlayerIds: string[];
    notes: string | null;
    createdAt?: Date | string | null;
    completedAt: Date | string | null;
  };
  entries: Array<{
    id: string;
    playerId: string;
    playerName: string;
    team: TeamCode | null;
    holeScores: Array<number | null>;
    goodSkinEntries: GoodSkinEntry[];
    startQuota: number;
    frontQuota: number;
    backQuota: number;
    frontNine: number;
    backNine: number;
    frontPlusMinus: number;
    backPlusMinus: number;
    totalPoints: number;
    plusMinus: number;
    nextQuota: number;
    rank: number;
  }>;
  teamStandings: Array<{
    team: TeamCode;
    players: string[];
    frontPoints: number;
    backPoints: number;
    totalPoints: number;
    frontQuota: number;
    backQuota: number;
    totalQuota: number;
    frontPlusMinus: number;
    backPlusMinus: number;
    totalPlusMinus: number;
  }>;
  leaders: {
    frontTeam: { team: TeamCode; frontPlusMinus: number } | null;
    backTeam: { team: TeamCode; backPlusMinus: number } | null;
    totalTeam: { team: TeamCode; totalPlusMinus: number } | null;
  };
  money: {
    overallPot: {
      playerCount: number;
      totalPot: number;
      teamPot: number;
      frontPot: number;
      backPot: number;
      totalTeamPot: number;
      indyPot: number;
      skinsPot: number;
      placesPaid: number;
    };
    individualPayouts: Array<{
      playerId: string;
      playerName: string;
      rank: number;
      plusMinus: number;
      totalPoints: number;
      tied: boolean;
      placeLabel: string;
      payout: number;
    }>;
    individualRankings: Array<{
      playerId: string;
      playerName: string;
      rank: number;
      plusMinus: number;
      totalPoints: number;
      startQuota: number;
      tied: boolean;
    }>;
    skins: {
      totalPot: number;
      totalSkinSharesWon: number;
      valuePerSkin: number;
      totalDistributed: number;
      leftover: number;
      holes: Array<{
        holeNumber: number;
        carryover: boolean;
        skinAwarded: boolean;
        winnerPlayerId: string | null;
        winnerName: string | null;
      }>;
    };
  };
  quotaAudit?: QuotaValidationSummary;
};

type CollapsibleSectionProps = {
  title: string;
  subtitle?: string;
  badge?: string;
  defaultOpen?: boolean;
  featured?: boolean;
  children: React.ReactNode;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2
  }).format(value);
}

function teamCardTone(isWinner: boolean) {
  return isWinner ? "border-[#5A9764] bg-[#EAF6EC]" : "border-ink/10 bg-canvas";
}

function formatQuotaResult(value: number) {
  return value === 0 ? "Even" : formatPlusMinus(value);
}

function getGoodSkinTypeClasses(label: string) {
  if (label === "Hole-in-One") return "bg-[#1B6B3A] text-white";
  if (label === "Eagle") return "bg-[#1A263B] text-white";
  if (label === "Birdie") return "bg-[#EAF6EC] text-pine";
  return "bg-[#EAF6EC] text-pine";
}

function formatOrdinal(value: number) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

function buildIndyRankings<T extends { playerId: string; playerName: string; startQuota: number; totalPoints: number; plusMinus: number }>(rows: T[]) {
  const sorted = [...rows].sort((left, right) => {
    if (right.plusMinus !== left.plusMinus) {
      return right.plusMinus - left.plusMinus;
    }

    if (right.totalPoints !== left.totalPoints) {
      return right.totalPoints - left.totalPoints;
    }

    return left.playerName.localeCompare(right.playerName);
  });

  let previousKey = "";
  let currentRank = 0;

  return sorted.map((row, index) => {
    const rankKey = `${row.plusMinus}:${row.totalPoints}`;
    if (rankKey !== previousKey) {
      currentRank = index + 1;
      previousKey = rankKey;
    }

    return {
      ...row,
      rank: currentRank
    };
  });
}

function ResultStatCard({
  title,
  value,
  detail
}: {
  title: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-[18px] border border-ink/10 bg-white px-4 py-3 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink/45">{title}</p>
      <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-pine">{value}</p>
      {detail ? <p className="mt-1.5 text-sm font-medium text-ink/65">{detail}</p> : null}
    </div>
  );
}

function CollapsibleSection({ title, subtitle, badge, defaultOpen = false, featured = false, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <SectionCard className={classNames("overflow-hidden px-0 py-0 shadow-sm", featured ? "border border-[#1B6B3A]/25 bg-[#F7FBF4]" : "border border-ink/10 bg-white")}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className={classNames("font-extrabold uppercase tracking-[0.12em]", featured ? "text-xl text-[#123D2A]" : "text-lg text-[#1A263B]")}>{title}</p>
            {badge ? (
              <span className={classNames("rounded-full px-3 py-1 text-xs font-bold", featured ? "bg-[#1B6B3A] text-white" : "bg-canvas text-ink/70")}>
                {badge}
              </span>
            ) : null}
          </div>
          <div className={classNames("mt-2 h-1 w-16 rounded-full", featured ? "bg-[#1B6B3A]" : "bg-[#1A263B]/25")} />
          {subtitle ? <p className="mt-2 text-sm font-medium text-ink/65">{subtitle}</p> : null}
        </div>
        <span className="shrink-0 rounded-full bg-canvas px-3 py-1.5 text-xs font-bold text-ink/60">
          {open ? "Collapse" : "Expand"}
        </span>
      </button>
      <div
        className={classNames(
          "grid transition-all duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-ink/10 px-4 py-4">{children}</div>
        </div>
      </div>
    </SectionCard>
  );
}

function QuotaAuditWarning({ quotaAudit }: { quotaAudit?: QuotaValidationSummary }) {
  const showAdminQuotaAudit = process.env.NODE_ENV !== "production";

  if (!showAdminQuotaAudit || !quotaAudit || quotaAudit.mismatchCount === 0) {
    return null;
  }

  return (
    <SectionCard className="border border-danger/20 bg-[#FCE5E2] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-danger/80">
        Quota Audit Warning
      </p>
      <p className="mt-1 text-sm text-ink/80">
        {`Quota audit warning: ${quotaAudit.mismatchCount} mismatch${quotaAudit.mismatchCount === 1 ? "" : "es"} found.`}
      </p>
    </SectionCard>
  );
}

export function RoundResults({ data }: { data: ResultsData }) {
  const isIndividualQuotaSkins = data.round.roundMode === "SKINS_ONLY";
  const payoutSummary = calculateFinalPayoutSummary(data.entries, data.round.roundMode);
  const payoutAudit = calculatePayoutAudit(data.entries, data.round.roundMode);
  const displayRoundDate = getRoundDisplayDate({
    roundName: data.round.roundName,
    roundDate: data.round.roundDate,
    completedAt: data.round.completedAt,
    createdAt: data.round.createdAt
  });
  const indyCashers = data.money.individualPayouts.filter((player) => player.payout > 0);
  const indyRankings = buildIndyRankings(
    data.entries.map((entry) => ({
      playerId: entry.playerId,
      playerName: entry.playerName,
      startQuota: entry.startQuota,
      totalPoints: entry.totalPoints,
      plusMinus: entry.plusMinus
    }))
  );
  const indyPayoutsByPlayerId = new Map(
    data.money.individualPayouts.map((player) => [player.playerId, player.payout])
  );
  const indyWinnerIds = new Set(indyCashers.map((player) => player.playerId));
  const goodSkins = data.money.skins.holes.filter((hole) => hole.skinAwarded && hole.winnerName);
  const goodSkinTypeByPlayerHole = new Map<string, string>();
  for (const entry of data.entries) {
    for (const skinEntry of entry.goodSkinEntries) {
      goodSkinTypeByPlayerHole.set(`${entry.playerId}:${skinEntry.holeNumber}`, goodSkinTypeLabels[skinEntry.type] ?? "Skin");
    }
  }

  return (
    <div className="space-y-4 pb-8">
      <PageTitle title="Results" subtitle={`Completed ${formatDisplayDate(displayRoundDate)}`} />
      <Link
        href="/past-games"
        className="inline-flex min-h-11 items-center rounded-2xl border border-ink/10 bg-canvas px-4 py-2 text-sm font-semibold text-ink shadow-sm"
      >
        ← See All Results
      </Link>



      <CollapsibleSection
        title="Payout Summary"
        subtitle="Paid players and winning categories."
        badge={formatCurrency(payoutAudit.overallPaidOut)}
        defaultOpen
        featured
      >
        {payoutSummary.players.length ? (
          <div className="space-y-2">
            {payoutSummary.players.map((player) => {
              const categories = [
                { label: "Front", value: player.front },
                { label: "Back", value: player.back },
                { label: "Total", value: player.total },
                { label: "Indy", value: player.indy },
                { label: "Skins", value: player.skins }
              ].filter((category) => category.value > 0);
              const categorySummary = categories
                .map((category) => `${category.label} ${formatCurrency(category.value)}`)
                .join(" • ");

              return (
                <details
                  key={player.playerId}
                  className="group rounded-[18px] border border-[#1B6B3A]/20 bg-white px-3 py-2 shadow-sm [&>summary::-webkit-details-marker]:hidden"
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-extrabold text-ink">{player.playerName}</p>
                      <p className="shrink-0 text-base font-extrabold tracking-tight text-[#1B6B3A]">
                        {formatCurrency(player.totalWon)}
                      </p>
                    </div>
                    <p className="mt-1 truncate text-xs font-semibold text-ink/65">{categorySummary}</p>
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-ink/10 pt-2">
                    {categories.map((category) => (
                      <span
                        key={`${player.playerId}-${category.label}`}
                        className="rounded-full bg-[#EAF6EC] px-2.5 py-1 text-[11px] font-bold text-[#123D2A]"
                      >
                        {`${category.label}: ${formatCurrency(category.value)}`}
                      </span>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-ink/65">No payouts were earned in this round.</p>
        )}

        {payoutSummary.skinsLeftover > 0 ? (
          <div className="mt-2 rounded-[22px] border border-ink/10 bg-canvas px-4 py-3.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Leftover</p>
            <p className="mt-1 text-base font-semibold text-ink">
              {`${formatCurrency(payoutSummary.skinsLeftover)} discretionary / possible bartender tip`}
            </p>
          </div>
        ) : null}
      </CollapsibleSection>

      {!isIndividualQuotaSkins ? (
      <CollapsibleSection
        title="Team Results"
        subtitle="Final front, back, and total team performance."
      >
        {data.teamStandings.length ? (
          <div className="space-y-2">
            {data.teamStandings.map((team) => {
              const winningFront = data.leaders.frontTeam?.team === team.team;
              const winningBack = data.leaders.backTeam?.team === team.team;
              const winningTotal = data.leaders.totalTeam?.team === team.team;
              const winners = [
                winningFront ? "Front" : null,
                winningBack ? "Back" : null,
                winningTotal ? "Total" : null
              ].filter(Boolean);

              return (
                <details
                  key={team.team}
                  className={classNames(
                    "group rounded-[18px] border px-3 py-2 shadow-sm [&>summary::-webkit-details-marker]:hidden",
                    winningTotal ? "border-[#5A9764]/30 bg-[#EAF6EC]" : "border-ink/10 bg-canvas"
                  )}
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-extrabold text-ink">{`Team ${team.team}`}</p>
                      <p className="shrink-0 text-base font-extrabold tracking-tight text-pine">
                        {formatPlusMinus(team.totalPlusMinus)}
                      </p>
                    </div>
                    <p className="mt-1 truncate text-xs font-semibold text-ink/70">{team.players.join(", ")}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-ink/65">
                      {`Front: ${team.frontPoints}/${team.frontQuota} • Back: ${team.backPoints}/${team.backQuota} • Total: ${team.totalPoints}/${team.totalQuota}`}
                    </p>
                    {winners.length ? (
                      <p className="mt-1 text-xs font-bold text-pine">{`Winners: ${winners.join(", ")}`}</p>
                    ) : null}
                  </summary>
                  <div className="mt-2 grid grid-cols-3 gap-1.5 border-t border-ink/10 pt-2">
                    <div className={classNames("rounded-xl px-2 py-1.5", teamCardTone(winningFront))}>
                      <p className="text-[9px] uppercase tracking-[0.14em] text-ink/45">Front</p>
                      <p className="mt-0.5 text-xs font-bold">{`${team.frontPoints}/${team.frontQuota}`}</p>
                      <p className="text-[11px] font-semibold text-ink/60">{formatPlusMinus(team.frontPlusMinus)}</p>
                    </div>
                    <div className={classNames("rounded-xl px-2 py-1.5", teamCardTone(winningBack))}>
                      <p className="text-[9px] uppercase tracking-[0.14em] text-ink/45">Back</p>
                      <p className="mt-0.5 text-xs font-bold">{`${team.backPoints}/${team.backQuota}`}</p>
                      <p className="text-[11px] font-semibold text-ink/60">{formatPlusMinus(team.backPlusMinus)}</p>
                    </div>
                    <div className={classNames("rounded-xl px-2 py-1.5", teamCardTone(winningTotal))}>
                      <p className="text-[9px] uppercase tracking-[0.14em] text-ink/45">Total</p>
                      <p className="mt-0.5 text-xs font-bold">{`${team.totalPoints}/${team.totalQuota}`}</p>
                      <p className="text-[11px] font-semibold text-ink/60">{formatPlusMinus(team.totalPlusMinus)}</p>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-ink/65">No team results available.</p>
        )}
      </CollapsibleSection>
      ) : null}

      <CollapsibleSection title="Individual Quota Standings" subtitle="Ranked final standings versus quota." badge={`${indyRankings.length} players`}>
        {indyRankings.length ? (
          <div className="space-y-2">
            {indyRankings.map((player) => {
              const isIndyWinner = indyWinnerIds.has(player.playerId);
              const indyPayout = indyPayoutsByPlayerId.get(player.playerId) ?? 0;

              return (
                <div
                  key={player.playerId}
                  className={classNames(
                    "rounded-[22px] border px-4 py-3",
                    isIndyWinner ? "border-[#5A9764]/20 bg-[#EAF6EC]" : "border-ink/10 bg-canvas"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-10 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#1A263B] text-sm font-extrabold text-white">
                        {formatOrdinal(player.rank)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-base font-extrabold text-ink">{player.playerName}</p>
                        <p className="mt-1 text-sm font-semibold text-ink/65">{`${player.totalPoints} pts - ${formatQuotaResult(player.plusMinus)}`}</p>
                      </div>
                    </div>
                    {indyPayout > 0 ? (
                      <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-pine shadow-sm">
                        {formatCurrency(indyPayout)}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-ink/65">No Indy results.</p>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Good Skins"
        subtitle="Awarded winners only after tie and carryover resolution."
      >
        {goodSkins.length ? (
          <div className="space-y-2">
            {goodSkins.map((hole) => {
              const typeLabel = hole.winnerPlayerId
                ? goodSkinTypeByPlayerHole.get(`${hole.winnerPlayerId}:${hole.holeNumber}`) ?? "Skin"
                : "Skin";

              return (
                <div
                  key={hole.holeNumber}
                  className="flex items-center justify-between gap-3 rounded-[22px] border border-ink/10 bg-canvas px-4 py-3.5 shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate text-base font-extrabold text-ink">{hole.winnerName}</p>
                    <p className="mt-1 text-sm font-semibold text-ink/60">Skin awarded</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full bg-[#1A263B] px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.12em] text-white">{`Hole ${hole.holeNumber}`}</span>
                    <span className={classNames("rounded-full px-3 py-1.5 text-xs font-extrabold", getGoodSkinTypeClasses(typeLabel))}>{typeLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-ink/65">No good skins awarded.</p>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Pot Summary"
        subtitle="Round pots and paid-player summary."
        badge={`${payoutSummary.players.length} paid`}
      >
        <div className="grid grid-cols-2 gap-2.5">
          {!isIndividualQuotaSkins ? (
            <ResultStatCard
              title="Team Pots"
              value={formatCurrency(data.money.overallPot.teamPot)}
              detail={`${formatCurrency(data.money.overallPot.frontPot)} / ${formatCurrency(data.money.overallPot.backPot)} / ${formatCurrency(data.money.overallPot.totalTeamPot)}`}
            />
          ) : null}
          <ResultStatCard
            title="Indy Pot"
            value={formatCurrency(data.money.overallPot.indyPot)}
            detail={`${data.money.overallPot.placesPaid} places paid`}
          />
          <ResultStatCard
            title="Skins Pot"
            value={formatCurrency(data.money.overallPot.skinsPot)}
            detail={
              data.money.skins.totalSkinSharesWon
                ? `${data.money.skins.totalSkinSharesWon} awarded`
                : "No skins won"
            }
          />
          <ResultStatCard
            title="Total Pot"
            value={formatCurrency(isIndividualQuotaSkins ? payoutAudit.overallPot : data.money.overallPot.totalPot)}
            detail={`${data.money.overallPot.playerCount} players`}
          />
        </div>
      </CollapsibleSection>





      <CollapsibleSection
        title="Skins Pot"
        subtitle="Awarded skins, paid total, and leftover."
        badge={`${data.money.skins.totalSkinSharesWon} awarded`}
      >
        <div className="grid grid-cols-2 gap-2.5">
          <ResultStatCard title="Skins Pot" value={formatCurrency(data.money.skins.totalPot)} />
          <ResultStatCard title="Per Skin" value={formatCurrency(data.money.skins.valuePerSkin)} />
          <ResultStatCard title="Total Paid" value={formatCurrency(data.money.skins.totalDistributed)} />
          <ResultStatCard title="Leftover" value={formatCurrency(data.money.skins.leftover)} />
        </div>
      </CollapsibleSection>





      <CollapsibleSection
        title="Pot Check"
        subtitle="Final reconciliation of pots, payouts, skins, and leftover."
        badge={payoutAudit.passed ? "Passed" : "Needs review"}
      >
        <div className="grid grid-cols-2 gap-2.5">
          <ResultStatCard title="Front Pot" value={formatCurrency(payoutAudit.frontPot)} />
          <ResultStatCard title="Back Pot" value={formatCurrency(payoutAudit.backPot)} />
          <ResultStatCard title="Total Pot" value={formatCurrency(payoutAudit.totalPot)} />
          <ResultStatCard title="Indy Pot" value={formatCurrency(payoutAudit.indyPot)} />
          <ResultStatCard title="Skins Pot" value={formatCurrency(payoutAudit.skinsPot)} />
          <ResultStatCard title="Overall Pot" value={formatCurrency(payoutAudit.overallPot)} />
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <ResultStatCard title="Good Skins Awarded" value={`${payoutAudit.goodSkinsAwarded}`} />
          <ResultStatCard title="Per Skin Value" value={formatCurrency(payoutAudit.perSkinValue)} />
          <ResultStatCard title="Total Skins Paid" value={formatCurrency(payoutAudit.skinsPaid)} />
          <ResultStatCard title="Leftover" value={formatCurrency(payoutAudit.leftover)} />
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <ResultStatCard title="Total Front Paid" value={formatCurrency(payoutAudit.frontPaid)} />
          <ResultStatCard title="Total Back Paid" value={formatCurrency(payoutAudit.backPaid)} />
          <ResultStatCard title="Total Match Paid" value={formatCurrency(payoutAudit.totalMatchPaid)} />
          <ResultStatCard title="Total Indy Paid" value={formatCurrency(payoutAudit.indyPaid)} />
          <ResultStatCard title="Total Skins Paid" value={formatCurrency(payoutAudit.skinsPaid)} />
          <ResultStatCard title="Overall Paid Out" value={formatCurrency(payoutAudit.overallPaidOut)} />
        </div>

        <div className="mt-2.5 space-y-2">
          {payoutAudit.checks.map((check) => (
            <div
              key={check.label}
              className={classNames(
                "rounded-[22px] border px-4 py-3",
                check.passed ? "border-[#5A9764]/20 bg-[#EAF6EC]" : "border-danger/20 bg-[#FCE5E2]"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ink">{check.label}</p>
                <p className={classNames("text-sm font-semibold", check.passed ? "text-pine" : "text-danger")}>
                  {formatPayoutAuditStatus(check.label, check.difference)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <QuotaAuditWarning quotaAudit={data.quotaAudit} />

      <Link
        href="/past-games"
        className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-ink/10 bg-canvas px-4 py-2 text-sm font-semibold text-ink shadow-sm"
      >
        ← See All Results
      </Link>
    </div>
  );
}







