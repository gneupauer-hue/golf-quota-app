"use client";

import Link from "next/link";
import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";
import { classNames, formatDisplayDate } from "@/lib/utils";
import type { SeasonStatsSort } from "@/lib/data";

type SeasonStatsData = {
  seasonStartDate: Date;
  sortBy: SeasonStatsSort;
  summary: {
    moneyLeader: SeasonStatRow | null;
    mostImproved: SeasonStatRow | null;
    skinsLeader: SeasonStatRow | null;
    mostRoundsPlayed: SeasonStatRow | null;
  };
  players: SeasonStatRow[];
};

type SeasonStatRow = {
  playerId: string;
  playerName: string;
  isRegular: boolean;
  isActive: boolean;
  roundsPlayed: number;
  currentQuota: number;
  startingQuota: number;
  quotaChange: number;
  totalPaidIn: number;
  totalPaidOut: number;
  netWinnings: number;
  totalSkinsWinnings: number;
  totalIndyWinnings: number;
  totalFrontWinnings: number;
  totalBackWinnings: number;
  totalTotalMatchWinnings: number;
  skinsCount: number;
  indyCashes: number;
  indyWins: number;
  teamWins: number;
};

const sortOptions: Array<{ value: SeasonStatsSort; label: string }> = [
  { value: "net", label: "Net" },
  { value: "improved", label: "Most Improved" },
  { value: "rounds", label: "Rounds Played" },
  { value: "quota", label: "Quota" }
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2
  }).format(value);
}

function formatQuotaChange(value: number) {
  if (value > 0) {
    return `+${value}`;
  }

  return `${value}`;
}

function summaryValue(
  row: SeasonStatRow | null,
  type: "net" | "improved" | "skins" | "rounds"
) {
  if (!row) {
    return "No rounds yet";
  }

  if (type === "net") {
    return formatCurrency(row.netWinnings);
  }

  if (type === "improved") {
    return formatQuotaChange(row.quotaChange);
  }

  if (type === "skins") {
    return `${formatCurrency(row.totalSkinsWinnings)} · ${row.skinsCount} skin${row.skinsCount === 1 ? "" : "s"}`;
  }

  return `${row.roundsPlayed} round${row.roundsPlayed === 1 ? "" : "s"}`;
}

export function SeasonStats({ data }: { data: SeasonStatsData }) {
  const hasSeasonRounds = data.players.some((player) => player.roundsPlayed > 0);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Season Stats"
        subtitle={`Completed real rounds after ${formatDisplayDate(data.seasonStartDate)} only.`}
      />

      <div className="grid grid-cols-2 gap-3">
        {[
          {
            label: "Money Leader",
            row: data.summary.moneyLeader,
            value: summaryValue(data.summary.moneyLeader, "net")
          },
          {
            label: "Most Improved",
            row: data.summary.mostImproved,
            value: summaryValue(data.summary.mostImproved, "improved")
          },
          {
            label: "Skins Leader",
            row: data.summary.skinsLeader,
            value: summaryValue(data.summary.skinsLeader, "skins")
          },
          {
            label: "Most Rounds Played",
            row: data.summary.mostRoundsPlayed,
            value: summaryValue(data.summary.mostRoundsPlayed, "rounds")
          }
        ].map((item) => (
          <SectionCard key={item.label} className="space-y-2 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink/50">
              {item.label}
            </p>
            <p className="text-lg font-semibold text-ink">
              {item.row?.playerName ?? "Waiting on season rounds"}
            </p>
            <p className="text-sm font-semibold text-pine">{item.value}</p>
          </SectionCard>
        ))}
      </div>

      <SectionCard className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
              Sort
            </p>
            <p className="mt-1 text-sm text-ink/65">
              Reorder the season table by the stat you care about most.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {sortOptions.map((option) => (
            <Link
              key={option.value}
              href={`/season-stats?sort=${option.value}`}
              className={classNames(
                "flex min-h-12 items-center justify-center rounded-2xl px-3 text-sm font-semibold",
                data.sortBy === option.value ? "bg-pine text-canvas" : "bg-canvas text-ink"
              )}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </SectionCard>

      <SectionCard className="space-y-3 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
            Year-To-Date
          </p>
          <h3 className="mt-1 text-lg font-semibold text-ink">Season table</h3>
          <p className="mt-1 text-sm text-ink/65">
            Starting quota comes from each player&apos;s first completed round after the season start date.
          </p>
        </div>

        {!hasSeasonRounds ? (
          <div className="rounded-[22px] bg-canvas px-4 py-4 text-sm text-ink/70">
            No completed season rounds yet. Stats will populate automatically after the first real round is finished.
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-2">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/50">
                <th className="px-2 py-1">Player</th>
                <th className="px-2 py-1">Rounds</th>
                <th className="px-2 py-1">Quota</th>
                <th className="px-2 py-1">Change</th>
                <th className="px-2 py-1">Paid In</th>
                <th className="px-2 py-1">Paid Out</th>
                <th className="px-2 py-1">Net</th>
                <th className="px-2 py-1">Skins</th>
                <th className="px-2 py-1">Indy</th>
              </tr>
            </thead>
            <tbody>
              {data.players.map((player) => (
                <tr key={player.playerId} className="rounded-[22px] bg-canvas text-sm text-ink">
                  <td className="rounded-l-[22px] px-2 py-3 align-top">
                    <div className="min-w-[180px]">
                      <p className="font-semibold text-ink">{player.playerName}</p>
                      <p className="mt-1 text-xs text-ink/60">
                        {`Start ${player.startingQuota} · Front ${formatCurrency(player.totalFrontWinnings)} · Back ${formatCurrency(player.totalBackWinnings)} · Total ${formatCurrency(player.totalTotalMatchWinnings)}`}
                      </p>
                      <p className="mt-1 text-xs text-ink/60">
                        {`${player.skinsCount} skins · ${player.indyCashes} indy cash${player.indyCashes === 1 ? "" : "es"} · ${player.teamWins} team win${player.teamWins === 1 ? "" : "s"}`}
                      </p>
                    </div>
                  </td>
                  <td className="px-2 py-3 align-top font-semibold">{player.roundsPlayed}</td>
                  <td className="px-2 py-3 align-top font-semibold">{player.currentQuota}</td>
                  <td
                    className={classNames(
                      "px-2 py-3 align-top font-semibold",
                      player.quotaChange > 0
                        ? "text-pine"
                        : player.quotaChange < 0
                          ? "text-danger"
                          : "text-ink"
                    )}
                  >
                    {formatQuotaChange(player.quotaChange)}
                  </td>
                  <td className="px-2 py-3 align-top font-semibold">{formatCurrency(player.totalPaidIn)}</td>
                  <td className="px-2 py-3 align-top font-semibold">{formatCurrency(player.totalPaidOut)}</td>
                  <td
                    className={classNames(
                      "px-2 py-3 align-top font-semibold",
                      player.netWinnings > 0
                        ? "text-pine"
                        : player.netWinnings < 0
                          ? "text-danger"
                          : "text-ink"
                    )}
                  >
                    {formatCurrency(player.netWinnings)}
                  </td>
                  <td className="px-2 py-3 align-top font-semibold">{formatCurrency(player.totalSkinsWinnings)}</td>
                  <td className="rounded-r-[22px] px-2 py-3 align-top font-semibold">{formatCurrency(player.totalIndyWinnings)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
