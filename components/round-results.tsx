import Link from "next/link";
import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";
import {
  calculateFinalPayoutSummary,
  formatPlusMinus,
  type TeamCode
} from "@/lib/quota";
import { classNames, formatDisplayDate } from "@/lib/utils";

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
    skins: {
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

export function RoundResults({ data }: { data: ResultsData }) {
  const isSkinsOnly = data.round.roundMode === "SKINS_ONLY";
  const payoutSummary = calculateFinalPayoutSummary(data.entries, data.round.roundMode);
  const indyCashers = data.money.individualPayouts.filter((player) => player.payout > 0);
  const goodSkins = data.money.skins.holes.filter((hole) => hole.skinAwarded && hole.winnerName);

  return (
    <div className="space-y-3 pb-8">
      <PageTitle
        title={`${data.round.roundName} Results`}
        subtitle={`Round date ${formatDisplayDate(data.round.roundDate)}`}
        action={
          <Link
            href={`/rounds/${data.round.id}`}
            className="rounded-2xl bg-pine px-4 py-3 text-sm font-semibold text-white"
          >
            Edit Round
          </Link>
        }
      />

      <SectionCard className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
          Money And Payouts
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          {[
            {
              title: "Team Pots",
              value: formatCurrency(data.money.overallPot.teamPot),
              detail: `${formatCurrency(data.money.overallPot.frontPot)} / ${formatCurrency(data.money.overallPot.backPot)} / ${formatCurrency(data.money.overallPot.totalTeamPot)}`
            },
            {
              title: "Indy Pot",
              value: formatCurrency(data.money.overallPot.indyPot),
              detail: `${data.money.overallPot.placesPaid} places paid`
            },
            {
              title: "Good Skins",
              value: formatCurrency(data.money.overallPot.skinsPot),
              detail: goodSkins.length ? `${goodSkins.length} skins won` : "No skins won"
            },
            {
              title: "Total Pot",
              value: formatCurrency(data.money.overallPot.totalPot),
              detail: `${data.money.overallPot.playerCount} players`
            }
          ].map((card) => (
            <div key={card.title} className="rounded-[22px] border border-ink/10 bg-canvas px-4 py-3.5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">{card.title}</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">{card.value}</p>
              <p className="mt-2 text-sm text-ink/60">{card.detail}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      {data.teamStandings.length ? (
        <SectionCard className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
            Team Standings
          </p>
          <div className="space-y-2">
            {data.teamStandings.map((team) => {
              const winningFront = data.leaders.frontTeam?.team === team.team;
              const winningBack = data.leaders.backTeam?.team === team.team;
              const winningTotal = data.leaders.totalTeam?.team === team.team;

              return (
                <div
                  key={team.team}
                  className={classNames(
                    "rounded-[22px] border px-4 py-3",
                    winningTotal ? "border-[#5A9764] bg-[#E2F4E6]" : "border-ink/10 bg-canvas"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold">{`Team ${team.team}`}</p>
                      <p className="mt-1 text-xs text-ink/60">{team.players.join(", ")}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {winningFront ? (
                        <span className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-pine">
                          Front Winner
                        </span>
                      ) : null}
                      {winningBack ? (
                        <span className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-pine">
                          Back Winner
                        </span>
                      ) : null}
                      {winningTotal ? (
                        <span className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-pine">
                          Total Winner
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className={classNames("rounded-2xl px-3 py-2", teamCardTone(winningFront))}>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Front +/-</p>
                      <p className="mt-1 text-lg font-semibold">{formatPlusMinus(team.frontPlusMinus)}</p>
                    </div>
                    <div className={classNames("rounded-2xl px-3 py-2", teamCardTone(winningBack))}>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Back +/-</p>
                      <p className="mt-1 text-lg font-semibold">{formatPlusMinus(team.backPlusMinus)}</p>
                    </div>
                    <div className={classNames("rounded-2xl px-3 py-2", teamCardTone(winningTotal))}>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Total +/-</p>
                      <p className="mt-1 text-lg font-semibold">{formatPlusMinus(team.totalPlusMinus)}</p>
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
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
            Indy Cashers
          </p>
          <div className="space-y-2">
            {indyCashers.map((player) => (
              <div key={player.playerId} className="flex items-center justify-between rounded-[22px] border border-ink/10 bg-canvas px-4 py-3.5">
                <div>
                  <p className="text-lg font-semibold">{player.playerName}</p>
                  <p className="mt-1 text-sm text-ink/60">
                    {`Place ${player.placeLabel} | ${formatPlusMinus(player.plusMinus)}`}
                    {player.tied ? " | Tie split" : ""}
                  </p>
                </div>
                <p className="text-2xl font-semibold text-pine">{formatCurrency(player.payout)}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {goodSkins.length ? (
        <SectionCard className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
            Good Skins Winners
          </p>
          <div className="space-y-2">
            {goodSkins.map((hole) => (
              <div key={hole.holeNumber} className="rounded-[22px] border border-ink/10 bg-canvas px-4 py-3">
                <p className="text-base font-semibold text-ink">{`Hole ${hole.holeNumber} — ${hole.winnerName}`}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
          Payout Summary
        </p>
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
                <div key={player.playerId} className="rounded-[22px] border border-ink/10 bg-canvas px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-base font-semibold text-ink">{player.playerName}</p>
                    <p className="text-lg font-semibold text-pine">{formatCurrency(player.totalWon)}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {categories.map((category) => (
                      <span
                        key={`${player.playerId}-${category.label}`}
                        className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink"
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
      </SectionCard>
    </div>
  );
}
