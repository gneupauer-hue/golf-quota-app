import Link from "next/link";
import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";
import { formatPlusMinus, type TeamCode } from "@/lib/quota";
import { classNames, formatDisplayDate } from "@/lib/utils";

type ResultsData = {
  round: {
    id: string;
    roundName: string;
    roundDate: Date | string;
    notes: string | null;
    completedAt: Date | string | null;
  };
  entries: Array<{
    id: string;
    playerId: string;
    playerName: string;
    team: TeamCode | null;
    startQuota: number;
    frontNine: number;
    backNine: number;
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
    leaderGroup: { playerName: string; plusMinus: number }[];
    payoutGroup: { playerName: string; plusMinus: number }[];
    first: { playerName: string; team: TeamCode | null; plusMinus: number } | null;
    second: { playerName: string; team: TeamCode | null; plusMinus: number } | null;
    third: { playerName: string; team: TeamCode | null; plusMinus: number } | null;
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
    teamPots: {
      frontPot: number;
      backPot: number;
      totalPot: number;
      frontWinner: { team: TeamCode } | null;
      backWinner: { team: TeamCode } | null;
      totalWinner: { team: TeamCode } | null;
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
    payoutByPlace: Array<{
      place: number;
      payout: number;
      playerNames: string[];
    }>;
    cashers: Array<{ playerId: string; playerName: string; plusMinus: number; payout: number; placeLabel: string }>;
    skins: {
      totalPot: number;
      totalSkinSharesWon: number;
      valuePerSkin: number;
      currentCarryoverCount: number;
      currentCarryoverHoles: number[];
      holes: Array<{
        holeNumber: number;
        eligibleNames: string[];
        carryover: boolean;
        skinAwarded: boolean;
        winnerName: string | null;
        sharesCaptured: number;
      }>;
      winners: Array<{
        playerId: string;
        playerName: string;
        skinsWon: number;
        payout: number;
      }>;
    };
  };
};

function podiumTone(place: 1 | 2 | 3) {
  if (place === 1) {
    return "border-[#5A9764] bg-[#E2F4E6]";
  }
  if (place === 2) {
    return "border-[#D5B154] bg-[#FFF1BF]";
  }
  return "border-[#D37A47] bg-[#FCE0D2]";
}

function entryTone(rank: number, plusMinus: number) {
  if (plusMinus < 0) {
    return "border-[#D7655D] bg-[#FCE5E2]";
  }
  if (rank === 1) {
    return "border-[#5A9764] bg-[#E2F4E6]";
  }
  if (rank === 2) {
    return "border-[#D5B154] bg-[#FFF1BF]";
  }
  if (rank === 3) {
    return "border-[#D37A47] bg-[#FCE0D2]";
  }
  return "border-ink/10 bg-white";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2
  }).format(value);
}

export function RoundResults({ data }: { data: ResultsData }) {
  const podium = [
    { place: 1 as const, leader: data.leaders.first },
    { place: 2 as const, leader: data.leaders.second },
    { place: 3 as const, leader: data.leaders.third }
  ];

  return (
    <div className="space-y-4 pb-10">
      <PageTitle
        title={`${data.round.roundName} Scoreboard`}
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

      <SectionCard className="space-y-3 bg-ink text-white">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">
            Winners
          </p>
          <h3 className="mt-1 text-2xl font-semibold tracking-tight">Round scoreboard</h3>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            {
              label: "Front",
              winner: data.leaders.frontTeam ? `Team ${data.leaders.frontTeam.team}` : "-",
              score: data.leaders.frontTeam ? formatPlusMinus(data.leaders.frontTeam.frontPlusMinus) : "-"
            },
            {
              label: "Back",
              winner: data.leaders.backTeam ? `Team ${data.leaders.backTeam.team}` : "-",
              score: data.leaders.backTeam ? formatPlusMinus(data.leaders.backTeam.backPlusMinus) : "-"
            },
            {
              label: "Total",
              winner: data.leaders.totalTeam ? `Team ${data.leaders.totalTeam.team}` : "-",
              score: data.leaders.totalTeam ? formatPlusMinus(data.leaders.totalTeam.totalPlusMinus) : "-"
            }
          ].map((item) => (
            <div key={item.label} className="rounded-2xl bg-white/10 px-3 py-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/55">{item.label}</p>
              <p className="mt-1 text-sm font-semibold">{item.winner}</p>
              <p className="mt-1 text-lg font-semibold">{item.score}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-2">
          <div className="rounded-2xl bg-white/10 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/55">Leader Group (Top 25%)</p>
            <p className="mt-1 text-sm font-semibold">
              {data.leaders.leaderGroup.length
                ? data.leaders.leaderGroup.map((player) => `${player.playerName} ${formatPlusMinus(player.plusMinus)}`).join(" | ")
                : "-"}
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/55">Payout Positions (Top 25%)</p>
            <p className="mt-1 text-sm font-semibold">
              {data.leaders.payoutGroup.length
                ? data.leaders.payoutGroup.map((player) => `${player.playerName} ${formatPlusMinus(player.plusMinus)}`).join(" | ")
                : "-"}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
          Money And Payouts
        </p>
        <div className="grid grid-cols-2 gap-3">
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
              detail: data.money.skins.totalSkinSharesWon
                ? `${data.money.skins.totalSkinSharesWon} skins won`
                : "No skins won"
            },
            {
              title: "Total Pot",
              value: formatCurrency(data.money.overallPot.totalPot),
              detail: `${data.money.overallPot.playerCount} players`
            }
          ].map((card) => (
            <div key={card.title} className="rounded-[24px] border border-ink/10 bg-canvas px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">{card.title}</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">{card.value}</p>
              <p className="mt-2 text-sm text-ink/60">{card.detail}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Team Winners</p>
          {[
            {
              label: "Front Winner",
              winner: data.money.teamPots.frontWinner ? `Team ${data.money.teamPots.frontWinner.team}` : "-",
              amount: data.money.teamPots.frontPot
            },
            {
              label: "Back Winner",
              winner: data.money.teamPots.backWinner ? `Team ${data.money.teamPots.backWinner.team}` : "-",
              amount: data.money.teamPots.backPot
            },
            {
              label: "Total Winner",
              winner: data.money.teamPots.totalWinner ? `Team ${data.money.teamPots.totalWinner.team}` : "-",
              amount: data.money.teamPots.totalPot
            }
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between rounded-[22px] border border-[#5A9764] bg-[#E2F4E6] px-4 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">{item.label}</p>
                <p className="mt-1 text-xl font-semibold">{item.winner}</p>
              </div>
              <p className="text-2xl font-semibold text-pine">{formatCurrency(item.amount)}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Individual Cashers</p>
          <div className="rounded-[22px] border border-ink/10 bg-canvas px-4 py-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-white/80 px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Indy Pot</p>
                <p className="mt-1 text-xl font-semibold">{formatCurrency(data.money.overallPot.indyPot)}</p>
              </div>
              <div className="rounded-2xl bg-white/80 px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Places Paid</p>
                <p className="mt-1 text-xl font-semibold">{data.money.overallPot.placesPaid}</p>
              </div>
              {[1, 2, 3, 4].map((place) => {
                const payout = data.money.payoutByPlace.find((entry) => entry.place === place);
                return (
                  <div key={place} className="rounded-2xl bg-white/80 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">{`${place}${place === 1 ? "st" : place === 2 ? "nd" : place === 3 ? "rd" : "th"} Payout`}</p>
                    <p className="mt-1 text-xl font-semibold">{payout ? formatCurrency(payout.payout) : "-"}</p>
                    <p className="mt-1 text-xs text-ink/60">{payout ? payout.playerNames.join(", ") : "Not paid"}</p>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            {data.money.individualPayouts.map((player) => (
              <div key={player.playerId} className="flex items-center justify-between rounded-[22px] border border-ink/10 bg-canvas px-4 py-4">
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
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Skins Winners</p>
          <div className="rounded-[22px] border border-ink/10 bg-canvas px-4 py-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-white/80 px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Skins Pot</p>
                <p className="mt-1 text-xl font-semibold">{formatCurrency(data.money.skins.totalPot)}</p>
              </div>
              <div className="rounded-2xl bg-white/80 px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Good Skins Won</p>
                <p className="mt-1 text-xl font-semibold">{data.money.skins.totalSkinSharesWon}</p>
              </div>
              <div className="rounded-2xl bg-white/80 px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Per Skin</p>
                <p className="mt-1 text-xl font-semibold">
                  {data.money.skins.totalSkinSharesWon > 0 ? formatCurrency(data.money.skins.valuePerSkin) : "-"}
                </p>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {data.money.skins.winners.length ? (
                data.money.skins.winners.map((winner) => (
                  <div key={winner.playerId} className="flex items-center justify-between rounded-2xl bg-white/80 px-3 py-3">
                    <div>
                      <p className="text-lg font-semibold">{winner.playerName}</p>
                      <p className="mt-1 text-sm text-ink/60">{`${winner.skinsWon} skin share${winner.skinsWon === 1 ? "" : "s"}`}</p>
                    </div>
                    <p className="text-2xl font-semibold text-pine">{formatCurrency(winner.payout)}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-ink/60">No good skins were won.</p>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
          Top 3 Individuals
        </p>
        <div className="space-y-2">
          {podium.map((item) => (
            <div
              key={item.place}
              className={classNames(
                "flex items-center justify-between rounded-[22px] border px-4 py-3",
                podiumTone(item.place)
              )}
            >
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">{`${item.place}${item.place === 1 ? "st" : item.place === 2 ? "nd" : "rd"} Place`}</p>
                <p className="mt-1 text-lg font-semibold">{item.leader?.playerName ?? "-"}</p>
                <p className="mt-1 text-sm text-ink/65">
                  {item.leader?.team ? `Team ${item.leader.team}` : "No team"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Total +/-</p>
                <p className="mt-1 text-2xl font-semibold">
                  {item.leader ? formatPlusMinus(item.leader.plusMinus) : "-"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

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
                  <div className={classNames("rounded-2xl px-3 py-2", winningFront ? "bg-[#E2F4E6]" : "bg-white/80")}>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Players</p>
                    <p className="mt-1 text-base font-semibold">{team.players.length}</p>
                    <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-ink/45">Front Points</p>
                    <p className="mt-1 text-lg font-semibold">{team.frontPoints}</p>
                    <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-ink/45">Front Quota</p>
                    <p className="mt-1 text-base font-semibold">{team.frontQuota}</p>
                    <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-ink/45">Front +/-</p>
                    <p className="mt-1 text-lg font-semibold">{formatPlusMinus(team.frontPlusMinus)}</p>
                  </div>
                  <div className={classNames("rounded-2xl px-3 py-2", winningBack ? "bg-[#E2F4E6]" : "bg-white/80")}>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Back Points</p>
                    <p className="mt-1 text-lg font-semibold">{team.backPoints}</p>
                    <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-ink/45">Back Quota</p>
                    <p className="mt-1 text-base font-semibold">{team.backQuota}</p>
                    <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-ink/45">Back +/-</p>
                    <p className="mt-1 text-lg font-semibold">{formatPlusMinus(team.backPlusMinus)}</p>
                  </div>
                  <div className={classNames("rounded-2xl px-3 py-2", winningTotal ? "bg-[#E2F4E6]" : "bg-white/80")}>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Total Points</p>
                    <p className="mt-1 text-lg font-semibold">{team.totalPoints}</p>
                    <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-ink/45">Total Quota</p>
                    <p className="mt-1 text-base font-semibold">{team.totalQuota}</p>
                    <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-ink/45">Total +/-</p>
                    <p className="mt-1 text-lg font-semibold">{formatPlusMinus(team.totalPlusMinus)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
          Individual Standings
        </p>
        <div className="space-y-2">
          {data.entries.map((entry) => (
            <div
              key={entry.id}
              className={classNames("rounded-[22px] border px-4 py-3", entryTone(entry.rank, entry.plusMinus))}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-base font-semibold">{entry.playerName}</p>
                  <p className="mt-1 text-xs text-ink/60">
                    {`Rank ${entry.rank} | Team ${entry.team ?? "-"}`}
                    {data.leaders.leaderGroup.some((player) => player.playerName === entry.playerName) ? " | Leader" : ""}
                    {data.leaders.payoutGroup.some((player) => player.playerName === entry.playerName) ? " | Payout Position" : ""}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/80 px-4 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">+/-</p>
                  <p className={classNames("mt-1 text-xl font-semibold", entry.plusMinus < 0 ? "text-danger" : "text-ink")}>
                    {formatPlusMinus(entry.plusMinus)}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-2">
                <div className="rounded-2xl bg-white/80 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Start</p>
                  <p className="mt-1 text-lg font-semibold">{entry.startQuota}</p>
                </div>
                <div className="rounded-2xl bg-white/80 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Front</p>
                  <p className="mt-1 text-lg font-semibold">{entry.frontNine}</p>
                </div>
                <div className="rounded-2xl bg-white/80 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Back</p>
                  <p className="mt-1 text-lg font-semibold">{entry.backNine}</p>
                </div>
                <div className="rounded-2xl bg-white/80 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Total</p>
                  <p className="mt-1 text-lg font-semibold">{entry.totalPoints}</p>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-white/80 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Next Quota</p>
                  <p className="mt-1 text-lg font-semibold">{entry.nextQuota}</p>
                </div>
                <div className="rounded-2xl bg-white/80 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Team</p>
                  <p className="mt-1 text-lg font-semibold">{entry.team ?? "-"}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
