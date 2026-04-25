import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";
import {
  calculatePayoutAudit,
  calculateFinalPayoutSummary,
  formatPayoutAuditStatus,
  formatPlusMinus,
  type TeamCode
} from "@/lib/quota";
import { classNames, formatDisplayDate, getPreferredRoundName } from "@/lib/utils";

type ResultsData = {
  round: {
    id: string;
    roundName: string;
    roundDate: Date | string;
    roundMode: "MATCH_QUOTA" | "SKINS_ONLY";
    isPayoutLocked: boolean;
    paidPlayerIds: string[];
    notes: string | null;
    completedAt: Date | string | null;
  };
  entries: Array<{
    id: string;
    playerId: string;
    playerName: string;
    team: TeamCode | null;
    holeScores: Array<number | null>;
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
        winnerName: string | null;
      }>;
    };
  };
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

function getTeamLabel(team: TeamCode | null) {
  return team ? `Team ${team}` : "Tied";
}

function formatQuotaResult(value: number) {
  return value === 0 ? "Even" : formatPlusMinus(value);
}

function renderWinnerValue(value: number | null | undefined) {
  if (value == null) {
    return "Tied";
  }

  return formatPlusMinus(value);
}

function formatIndyRankingDetail(totalPoints: number, startQuota: number, plusMinus: number) {
  return `Points ${totalPoints} / Quota ${startQuota} = ${formatQuotaResult(plusMinus)}`;
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
    <div className="rounded-[22px] border border-ink/10 bg-canvas px-4 py-3.5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">{title}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-ink">{value}</p>
      {detail ? <p className="mt-2 text-sm text-ink/60">{detail}</p> : null}
    </div>
  );
}

export function RoundResults({ data }: { data: ResultsData }) {
  const isSkinsOnly = data.round.roundMode === "SKINS_ONLY";
  const payoutSummary = calculateFinalPayoutSummary(data.entries, data.round.roundMode);
  const payoutAudit = calculatePayoutAudit(data.entries, data.round.roundMode);
  const preferredRoundName = getPreferredRoundName(data.round.roundName, data.round.roundDate);
  const indyCashers = data.money.individualPayouts.filter((player) => player.payout > 0);
  const indyRankings = data.money.individualRankings;
  const indyWinnerIds = new Set(indyCashers.map((player) => player.playerId));
  const goodSkins = data.money.skins.holes.filter((hole) => hole.skinAwarded && hole.winnerName);
  const hasTeamWinnerSummary = !isSkinsOnly && data.teamStandings.length > 0;
  const topIndividual = data.entries[0] ?? null;
  const winnerCards = [
    {
      label: "Front",
      team: data.leaders.frontTeam?.team ?? null,
      value: data.leaders.frontTeam?.frontPlusMinus
    },
    {
      label: "Back",
      team: data.leaders.backTeam?.team ?? null,
      value: data.leaders.backTeam?.backPlusMinus
    },
    {
      label: "Total",
      team: data.leaders.totalTeam?.team ?? null,
      value: data.leaders.totalTeam?.totalPlusMinus
    }
  ];

  return (
    <div className="space-y-3 pb-8">
      <PageTitle
        title={`${preferredRoundName} Results`}
        subtitle={`Round date ${formatDisplayDate(data.round.roundDate)}`}
      />

      <SectionCard className="space-y-4 bg-grove text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/65">
              Final Results
            </p>
            <p className="mt-2 text-2xl font-bold tracking-tight">Round Complete</p>
            <p className="mt-1 text-sm text-white/75">
              {payoutAudit.passed
                ? "Winners, payouts, and pots all reconcile cleanly."
                : "Review the payout audit before paying out."}
            </p>
          </div>
          <span
              className={classNames(
                "rounded-full px-3 py-1.5 text-xs font-semibold",
                payoutAudit.passed ? "bg-white/14 text-white" : "bg-[#FCE5E2] text-danger"
              )}
            >
              {payoutAudit.passed ? "Pot Check Passed" : "Needs Review"}
            </span>
          </div>

        {hasTeamWinnerSummary ? (
          <div className="grid grid-cols-3 gap-2">
            {winnerCards.map((winner) => (
              <div key={winner.label} className="rounded-[22px] border border-white/12 bg-white/8 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">
                  {winner.label}
                </p>
                <p className="mt-2 text-sm font-semibold text-white">{getTeamLabel(winner.team)}</p>
                <p className="mt-1 text-xl font-bold tracking-tight text-[#D9C08B]">
                  {renderWinnerValue(winner.value)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-[22px] border border-white/12 bg-white/8 px-4 py-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">Round Summary</p>
              <p className="mt-2 text-xl font-bold tracking-tight text-white">
                {topIndividual ? topIndividual.playerName : preferredRoundName}
              </p>
              <p className="mt-2 text-sm text-white/75">
                {topIndividual
                  ? formatIndyRankingDetail(topIndividual.totalPoints, topIndividual.startQuota, topIndividual.plusMinus)
                  : "No saved team winner data for this archived round."}
              </p>
            </div>
            <div className="rounded-[22px] border border-white/12 bg-white/8 px-4 py-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">Field</p>
              <p className="mt-2 text-xl font-bold tracking-tight text-white">{`${data.entries.length} players`}</p>
              <p className="mt-2 text-sm text-white/75">
                {isSkinsOnly ? "Skins-only round" : "Team winner summary unavailable for this archived round."}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-[22px] border border-white/12 bg-white/8 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">
              Overall Pot
            </p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-white">
              {formatCurrency(payoutAudit.overallPot)}
            </p>
          </div>
          <div className="rounded-[22px] border border-white/12 bg-white/8 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">
              Paid Out
            </p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-white">
              {formatCurrency(payoutAudit.overallPaidOut)}
            </p>
            <p className="mt-1 text-xs text-white/65">{`${formatCurrency(payoutAudit.leftover)} leftover`}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
              Pot Summary
            </p>
            <p className="mt-1 text-sm text-ink/65">Round pots and paid-player summary.</p>
          </div>
          <span className="rounded-full bg-card px-3 py-1.5 text-xs font-semibold text-ink/70">
            {`${payoutSummary.players.length} paid`}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <ResultStatCard
            title="Team Pots"
            value={formatCurrency(data.money.overallPot.teamPot)}
            detail={`${formatCurrency(data.money.overallPot.frontPot)} / ${formatCurrency(data.money.overallPot.backPot)} / ${formatCurrency(data.money.overallPot.totalTeamPot)}`}
          />
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
            value={formatCurrency(data.money.overallPot.totalPot)}
            detail={`${data.money.overallPot.playerCount} players`}
          />
        </div>
      </SectionCard>

      {data.teamStandings.length ? (
        <SectionCard className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
              Team Results
            </p>
            <p className="mt-1 text-sm text-ink/65">
              Front, back, and total results with each team&apos;s quota targets.
            </p>
          </div>
          <div className="space-y-2">
            {data.teamStandings.map((team) => {
              const winningFront = data.leaders.frontTeam?.team === team.team;
              const winningBack = data.leaders.backTeam?.team === team.team;
              const winningTotal = data.leaders.totalTeam?.team === team.team;

              return (
                <div
                  key={team.team}
                  className={classNames(
                    "rounded-[24px] border px-4 py-4",
                    winningTotal ? "border-[#5A9764] bg-[#E2F4E6]" : "border-ink/10 bg-canvas"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-ink">{`Team ${team.team}`}</p>
                      <p className="mt-1 text-sm text-ink/60">{team.players.join(", ")}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold tracking-tight text-pine">
                        {formatPlusMinus(team.totalPlusMinus)}
                      </p>
                      <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                        {winningFront ? (
                          <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold text-pine">
                            Front winner
                          </span>
                        ) : null}
                        {winningBack ? (
                          <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold text-pine">
                            Back winner
                          </span>
                        ) : null}
                        {winningTotal ? (
                          <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold text-pine">
                            Total winner
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className={classNames("rounded-2xl px-3 py-2.5", teamCardTone(winningFront))}>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Front</p>
                      <p className="mt-1 text-lg font-bold">{`${team.frontPoints} of ${team.frontQuota}`}</p>
                      <p className="mt-1 text-xs font-semibold text-ink/60">
                        {formatPlusMinus(team.frontPlusMinus)}
                      </p>
                    </div>
                    <div className={classNames("rounded-2xl px-3 py-2.5", teamCardTone(winningBack))}>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Back</p>
                      <p className="mt-1 text-lg font-bold">{`${team.backPoints} of ${team.backQuota}`}</p>
                      <p className="mt-1 text-xs font-semibold text-ink/60">
                        {formatPlusMinus(team.backPlusMinus)}
                      </p>
                    </div>
                    <div className={classNames("rounded-2xl px-3 py-2.5", teamCardTone(winningTotal))}>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Total</p>
                      <p className="mt-1 text-lg font-bold">{`${team.totalPoints} of ${team.totalQuota}`}</p>
                      <p className="mt-1 text-xs font-semibold text-ink/60">
                        {formatPlusMinus(team.totalPlusMinus)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      ) : null}

      {!isSkinsOnly && indyCashers.length ? (
        <SectionCard className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
                Indy Cashers
              </p>
              <p className="mt-1 text-sm text-ink/65">Only players who cashed in the field payout.</p>
            </div>
            <span className="rounded-full bg-card px-3 py-1.5 text-xs font-semibold text-ink/70">
              {`${indyCashers.length} paid`}
            </span>
          </div>
          <div className="space-y-2">
            {indyCashers.map((player) => (
              <div
                key={player.playerId}
                className="flex items-center justify-between rounded-[22px] border border-ink/10 bg-canvas px-4 py-4"
              >
                <div>
                  <p className="text-lg font-bold text-ink">{player.playerName}</p>
                  <p className="mt-1 text-sm text-ink/60">
                    {`Place ${player.placeLabel}`}
                    {player.tied ? " • Tie split" : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-pine">{formatCurrency(player.payout)}</p>
                  <p className="mt-1 text-xs font-semibold text-ink/55">
                    {formatPlusMinus(player.plusMinus)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {goodSkins.length ? (
        <SectionCard className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
              Good Skins
            </p>
            <p className="mt-1 text-sm text-ink/65">Awarded winners only after tie and carryover resolution.</p>
          </div>
          <div className="space-y-2">
            {goodSkins.map((hole) => (
              <div
                key={hole.holeNumber}
                className="flex items-center justify-between gap-3 rounded-[22px] border border-ink/10 bg-canvas px-4 py-3.5"
              >
                <span className="rounded-full bg-card px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink/65">
                  {`Hole ${hole.holeNumber}`}
                </span>
                <p className="text-base font-semibold text-ink">{hole.winnerName}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
              Skins Pot
            </p>
            <p className="mt-1 text-sm text-ink/65">Awarded skins, paid total, and leftover.</p>
          </div>
          <span className="rounded-full bg-card px-3 py-1.5 text-xs font-semibold text-ink/70">
            {`${data.money.skins.totalSkinSharesWon} awarded`}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <ResultStatCard title="Skins Pot" value={formatCurrency(data.money.skins.totalPot)} />
          <ResultStatCard title="Per Skin" value={formatCurrency(data.money.skins.valuePerSkin)} />
          <ResultStatCard title="Total Paid" value={formatCurrency(data.money.skins.totalDistributed)} />
          <ResultStatCard title="Leftover" value={formatCurrency(data.money.skins.leftover)} />
        </div>
      </SectionCard>

      <SectionCard className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
            Indy Rankings
          </p>
          <p className="mt-1 text-sm text-ink/65">Final standings versus quota.</p>
        </div>
        {!isSkinsOnly && indyRankings.length ? (
          <div className="space-y-2">
            {indyRankings.map((player) => {
              const isIndyWinner = indyWinnerIds.has(player.playerId);

              return (
                <div
                  key={player.playerId}
                  className={classNames(
                    "rounded-[22px] border px-4 py-3",
                    isIndyWinner ? "border-[#5A9764]/20 bg-[#EAF6EC]" : "border-ink/10 bg-canvas"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="w-6 shrink-0 pt-0.5 text-sm font-semibold text-ink/55">
                      {`${player.rank}.`}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-ink">{player.playerName}</p>
                      <p className="mt-1 text-sm text-ink/70">
                        {formatIndyRankingDetail(player.totalPoints, player.startQuota, player.plusMinus)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-ink/65">No Indy results</p>
        )}
      </SectionCard>

      <SectionCard className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
              Payout Summary
            </p>
            <p className="mt-1 text-sm text-ink/65">Only paid players and winning categories.</p>
          </div>
          <span className="rounded-full bg-card px-3 py-1.5 text-xs font-semibold text-ink/70">
            {formatCurrency(payoutAudit.overallPaidOut)}
          </span>
        </div>

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

              return (
                <div key={player.playerId} className="rounded-[24px] border border-ink/10 bg-canvas px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-bold text-ink">{player.playerName}</p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink/45">
                        Paid Player
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-pine">{formatCurrency(player.totalWon)}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {categories.map((category) => (
                      <span
                        key={`${player.playerId}-${category.label}`}
                        className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink shadow-sm"
                      >
                        {`${category.label}: ${formatCurrency(category.value)}`}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-ink/65">No payouts were earned in this round.</p>
        )}

        {payoutSummary.skinsLeftover > 0 ? (
          <div className="rounded-[22px] border border-ink/10 bg-canvas px-4 py-3.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Leftover</p>
            <p className="mt-1 text-base font-semibold text-ink">
              {`${formatCurrency(payoutSummary.skinsLeftover)} discretionary / possible bartender tip`}
            </p>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
              Pot Check
            </p>
            <p className="mt-1 text-sm text-ink/65">
              Final reconciliation of pots, payouts, skins, and leftover.
            </p>
          </div>
          <span
            className={classNames(
              "rounded-full px-3 py-1.5 text-xs font-semibold",
              payoutAudit.passed ? "bg-[#E2F4E6] text-pine" : "bg-[#FCE5E2] text-danger"
            )}
          >
            {payoutAudit.passed ? "Passed" : "Needs review"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <ResultStatCard title="Front Pot" value={formatCurrency(payoutAudit.frontPot)} />
          <ResultStatCard title="Back Pot" value={formatCurrency(payoutAudit.backPot)} />
          <ResultStatCard title="Total Pot" value={formatCurrency(payoutAudit.totalPot)} />
          <ResultStatCard title="Indy Pot" value={formatCurrency(payoutAudit.indyPot)} />
          <ResultStatCard title="Skins Pot" value={formatCurrency(payoutAudit.skinsPot)} />
          <ResultStatCard title="Overall Pot" value={formatCurrency(payoutAudit.overallPot)} />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <ResultStatCard title="Good Skins Awarded" value={`${payoutAudit.goodSkinsAwarded}`} />
          <ResultStatCard title="Per Skin Value" value={formatCurrency(payoutAudit.perSkinValue)} />
          <ResultStatCard title="Total Skins Paid" value={formatCurrency(payoutAudit.skinsPaid)} />
          <ResultStatCard title="Leftover" value={formatCurrency(payoutAudit.leftover)} />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <ResultStatCard title="Total Front Paid" value={formatCurrency(payoutAudit.frontPaid)} />
          <ResultStatCard title="Total Back Paid" value={formatCurrency(payoutAudit.backPaid)} />
          <ResultStatCard title="Total Match Paid" value={formatCurrency(payoutAudit.totalMatchPaid)} />
          <ResultStatCard title="Total Indy Paid" value={formatCurrency(payoutAudit.indyPaid)} />
          <ResultStatCard title="Total Skins Paid" value={formatCurrency(payoutAudit.skinsPaid)} />
          <ResultStatCard title="Overall Paid Out" value={formatCurrency(payoutAudit.overallPaidOut)} />
        </div>

        <div className="space-y-2">
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
      </SectionCard>
    </div>
  );
}

