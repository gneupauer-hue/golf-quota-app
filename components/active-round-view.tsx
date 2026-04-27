"use client";

import { useEffect, useRef, useState } from "react";
import { SectionCard } from "@/components/section-card";
import {
  calculatePayoutAudit,
  formatPayoutAuditStatus,
  formatPlusMinus,
  type CalculatedRoundRow,
  type PayoutPredictionsSummary,
  type SideGameResults,
  type TeamCode,
  type TeamStanding
} from "@/lib/quota";
import { classNames } from "@/lib/utils";

type SaveState = {
  tone: "idle" | "saving" | "saved" | "failed";
  message: string;
};

type RowSubmissionState = {
  playerId: string;
  frontSubmittedAt: string | null;
  backSubmittedAt: string | null;
};

function formatTimeLabel(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2
  }).format(value);
}

function getGoalProgressTone(value: number) {
  if (value < 0) return "text-danger";
  if (value > 0) return "text-pine";
  return "text-ink";
}

function getGoalStatusChipClasses(value: number) {
  if (value < 0) {
    return "bg-[#FCE5E2] text-danger";
  }
  if (value > 0) {
    return "bg-[#E2F4E6] text-pine";
  }
  return "bg-canvas text-ink";
}

function formatGoalValue(value: number) {
  return value === 0 ? "E" : formatPlusMinus(value);
}

function sortTeamsAlphabetically<T extends { team: TeamCode }>(teams: T[]) {
  return [...teams].sort((left, right) => left.team.localeCompare(right.team));
}

function GoalStatusChip({
  label,
  value
}: {
  label: string;
  value: number;
}) {
  const [showUpdateCue, setShowUpdateCue] = useState(false);
  const previousValue = useRef<number | null>(null);

  useEffect(() => {
    if (previousValue.current == null) {
      previousValue.current = value;
      return;
    }

    if (previousValue.current !== value) {
      previousValue.current = value;
      setShowUpdateCue(true);
      const timeout = window.setTimeout(() => setShowUpdateCue(false), 900);
      return () => window.clearTimeout(timeout);
    }
  }, [value]);

  return (
    <div
      className={classNames(
        "flex min-w-0 flex-1 flex-col items-center justify-center rounded-full px-2 py-2 transition-all duration-500",
        getGoalStatusChipClasses(value),
        showUpdateCue ? "ring-2 ring-white/70 brightness-[1.04]" : ""
      )}
    >
      <p className="text-[9px] font-medium uppercase tracking-[0.12em] opacity-70">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-bold">{formatGoalValue(value)}</p>
    </div>
  );
}

function hasRecordedFinalHole(holeScores: Array<number | null>) {
  return holeScores[17] != null;
}

function getTeamProgress(rows: Array<CalculatedRoundRow>) {
  if (!rows.length) return 0;
  for (let holeIndex = 0; holeIndex < 18; holeIndex += 1) {
    if (!rows.every((row) => row.holeScores[holeIndex] != null)) {
      return holeIndex;
    }
  }
  return 18;
}

function countCompletedSegmentHoles(
  rows: Array<CalculatedRoundRow>,
  startIndex: number,
  endIndex: number
) {
  let completed = 0;

  for (let holeIndex = startIndex; holeIndex < endIndex; holeIndex += 1) {
    if (rows.every((row) => row.holeScores[holeIndex] != null)) {
      completed += 1;
    }
  }

  return completed;
}

function getPaceValueTone(current: number, expected: number, holesPlayed: number, tolerance = 0.5) {
  if (holesPlayed === 0) {
    return "text-ink";
  }

  const delta = current - expected;
  if (delta > tolerance) {
    return "text-pine";
  }
  if (delta < -tolerance) {
    return "text-danger";
  }
  return "text-ink";
}

function getPaceTileClasses(current: number, expected: number, holesPlayed: number, tolerance = 0.5) {
  if (holesPlayed === 0) {
    return "bg-white text-ink";
  }

  const delta = current - expected;
  if (delta > tolerance) {
    return "bg-[#EAF6EC] text-pine";
  }
  if (delta < -tolerance) {
    return "bg-[#FCE5E2] text-danger";
  }
  return "bg-white text-ink";
}

function getNeutralPacePresentation() {
  return {
    tone: "text-ink",
    tileClass: "bg-white text-ink"
  };
}

function buildTeamProgressItems(team: TeamStanding, teamRows: Array<CalculatedRoundRow>) {
  const frontHolesPlayed = countCompletedSegmentHoles(teamRows, 0, 9);
  const backHolesPlayed = countCompletedSegmentHoles(teamRows, 9, 18);
  const totalHolesPlayed = countCompletedSegmentHoles(teamRows, 0, 18);
  const frontExpected = (team.frontQuota / 9) * frontHolesPlayed;
  const backExpected = (team.backQuota / 9) * backHolesPlayed;
  const totalExpected = (team.totalQuota / 18) * totalHolesPlayed;
  const totalPacePresentation =
    backHolesPlayed > 0
      ? {
          tone: getPaceValueTone(team.totalPoints, totalExpected, totalHolesPlayed),
          tileClass: getPaceTileClasses(team.totalPoints, totalExpected, totalHolesPlayed)
        }
      : getNeutralPacePresentation();

  return {
    items: [
      {
        label: "Front",
        current: team.frontPoints,
        goal: team.frontQuota,
        tone: getPaceValueTone(team.frontPoints, frontExpected, frontHolesPlayed),
        tileClass: getPaceTileClasses(team.frontPoints, frontExpected, frontHolesPlayed)
      },
      {
        label: "Back",
        current: team.backPoints,
        goal: team.backQuota,
        tone: getPaceValueTone(team.backPoints, backExpected, backHolesPlayed),
        tileClass: getPaceTileClasses(team.backPoints, backExpected, backHolesPlayed)
      },
      {
        label: "Total",
        current: team.totalPoints,
        goal: team.totalQuota,
        tone: totalPacePresentation.tone,
        tileClass: totalPacePresentation.tileClass
      }
    ]
  };
}

type SharedProps = {
  rows: CalculatedRoundRow[];
  rowStates: RowSubmissionState[];
  isTestRound: boolean;
  saveState: SaveState;
  lastSavedAt: string | null;
  refreshState: SaveState;
  lastRefreshedAt: string | null;
};

function getTeamSubmissionState(
  teamRows: Array<CalculatedRoundRow>,
  rowStates: RowSubmissionState[]
) {
  return teamRows.length > 0 && teamRows.every((row) => {
    const rowState = rowStates.find((candidate) => candidate.playerId === row.playerId);
    return Boolean(rowState?.backSubmittedAt);
  });
}

function formatQuotaResult(value: number) {
  return value === 0 ? "Even" : formatPlusMinus(value);
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

export function MatchRoundView({
  rows,
  rowStates,
  roundName,
  teamStandings,
  teamRowsByCode,
  scoringGroups,
  selectedScoringGroupKey,
  visibleTeamCodes,
  isAdminCorrectionMode,
  sideGames,
  payoutSummary,
  isTestRound,
  saveState,
  lastSavedAt,
  refreshState,
  lastRefreshedAt,
  isArchiving,
  onArchiveRound,
  onOpenTeam,
  onSelectScoringGroup,
  onEnterAdminCorrectionMode,
  onExitAdminCorrectionMode,
  onRefresh
}: SharedProps & {
  roundName: string;
  teamStandings: TeamStanding[];
  teamRowsByCode: Map<TeamCode, CalculatedRoundRow[]>;
  scoringGroups: Array<{
    key: string;
    label: string;
    teams: TeamCode[];
    playerNames: string[];
  }>;
  selectedScoringGroupKey: string | null;
  visibleTeamCodes: Set<TeamCode>;
  isAdminCorrectionMode: boolean;
  sideGames: SideGameResults;
  payoutSummary: PayoutPredictionsSummary;
  isArchiving: boolean;
  onArchiveRound: () => void;
  onOpenTeam: (team: TeamCode) => void;
  onSelectScoringGroup: (groupKey: string) => void;
  onEnterAdminCorrectionMode: () => void;
  onExitAdminCorrectionMode: () => void;
  onRefresh: () => void;
}) {
  const lastRefreshedLabel = formatTimeLabel(lastRefreshedAt);
  const allTeamsSubmitted =
    teamStandings.length > 0 &&
    teamStandings.every((team) => getTeamSubmissionState(teamRowsByCode.get(team.team) ?? [], rowStates));
  const orderedTeamStandings = sortTeamsAlphabetically(teamStandings);
  const selectedScoringGroup =
    selectedScoringGroupKey == null
      ? scoringGroups[0] ?? null
      : scoringGroups.find((group) => group.key === selectedScoringGroupKey) ?? scoringGroups[0] ?? null;
  const visibleTeamStandings = orderedTeamStandings.filter((team) => visibleTeamCodes.has(team.team));
  const awardedSkins = allTeamsSubmitted
    ? sideGames.skins.holes.filter((hole) => hole.skinAwarded && hole.winnerName)
    : [];
  const paidPlayers = allTeamsSubmitted
    ? payoutSummary.players.filter((player) => player.projectedTotal > 0)
    : [];
  const indyRankings = allTeamsSubmitted
    ? buildIndyRankings(
        rows.map((row) => ({
          playerId: row.playerId,
          playerName: row.playerName,
          startQuota: row.startQuota,
          totalPoints: row.totalPoints,
          plusMinus: row.plusMinus
        }))
      )
    : [];
  const indyPayoutsByPlayerId = new Map(
    allTeamsSubmitted
      ? payoutSummary.players
          .filter((player) => player.indy > 0)
          .map((player) => [player.playerId, player.indy])
      : []
  );
  const indyWinnerIds = new Set(
    allTeamsSubmitted
      ? payoutSummary.players
          .filter((player) => player.indy > 0)
          .map((player) => player.playerId)
      : []
  );
  const payoutAudit = allTeamsSubmitted ? calculatePayoutAudit(rows, "MATCH_QUOTA") : null;

  function formatTeamPlayers(teamRows: Array<CalculatedRoundRow>) {
    return teamRows.map((row) => `${row.playerName} (${row.startQuota})`).join(", ");
  }


  return (
    <div className="space-y-4">
      <SectionCard className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Scoring Scope</p>
            <h3 className="mt-1 text-lg font-semibold">
              {isAdminCorrectionMode ? "Admin Fix Scores" : selectedScoringGroup?.label ?? "Select your foursome"}
            </h3>
            <p className="mt-1 text-sm text-ink/70">
              {isAdminCorrectionMode
                ? "Warning: you can edit any team and clear saved scores while this mode is on."
                : "Live scoring only shows the teams in your selected foursome so another scorer's teams stay protected."}
            </p>
          </div>
          <button
            type="button"
            onClick={isAdminCorrectionMode ? onExitAdminCorrectionMode : onEnterAdminCorrectionMode}
            className={classNames(
              "min-h-11 rounded-2xl px-4 py-2 text-sm font-semibold",
              isAdminCorrectionMode ? "bg-danger/12 text-danger" : "bg-canvas text-ink"
            )}
          >
            {isAdminCorrectionMode ? "Exit Fix Mode" : "Admin Fix Scores"}
          </button>
        </div>

        {scoringGroups.length > 1 ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {scoringGroups.map((group) => {
              const selected = group.key === selectedScoringGroupKey;
              return (
                <button
                  key={group.key}
                  type="button"
                  disabled={isAdminCorrectionMode}
                  onClick={() => onSelectScoringGroup(group.key)}
                  className={classNames(
                    "rounded-[22px] border px-4 py-3 text-left transition",
                    selected
                      ? "border-pine bg-pine text-white"
                      : "border-ink/10 bg-canvas text-ink",
                    isAdminCorrectionMode ? "opacity-60" : ""
                  )}
                >
                  <span className="block text-sm font-semibold">{group.label}</span>
                  <span className={classNames("mt-1 block text-xs", selected ? "text-white/75" : "text-ink/60")}>
                    {group.teams.map((team) => `Team ${team}`).join(" • ")}
                  </span>
                  <span className={classNames("mt-2 block text-xs leading-5", selected ? "text-white/80" : "text-ink/65")}>
                    {group.playerNames.join(", ")}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </SectionCard>

      <div className="space-y-3">
        {visibleTeamStandings.map((team) => {
          const teamRows = teamRowsByCode.get(team.team) ?? [];
          const progress = getTeamProgress(teamRows);
          const teamSubmitted = getTeamSubmissionState(teamRows, rowStates);
          const playerSummary = formatTeamPlayers(teamRows);
          const progressItems = buildTeamProgressItems(team, teamRows).items;
          return (
            <button
              key={team.team}
              type="button"
              onClick={() => onOpenTeam(team.team)}
              className="w-full rounded-[28px] border border-ink/10 bg-white/90 px-4 py-4 text-left shadow-card"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-2xl font-semibold">{`Team ${team.team}`}</p>
                    <p className="mt-1 text-sm leading-6 text-ink/70">{playerSummary}</p>
                  </div>
                  <div className={classNames("rounded-2xl px-4 py-3 text-center", teamSubmitted ? "bg-[#E2F4E6]" : "bg-canvas")}>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">
                      {teamSubmitted ? "Status" : "Next Hole"}
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      {teamSubmitted ? "Submitted" : Math.min(progress + 1, 18)}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {progressItems.map((item) => (
                    <div
                      key={`${team.team}-${item.label}`}
                      className={classNames("rounded-2xl px-3 py-2 text-center", item.tileClass)}
                    >
                      <p className="text-[9px] font-medium uppercase tracking-[0.14em] opacity-60">
                        {item.label}
                      </p>
                      <p className={classNames("mt-0.5 text-[19px] font-extrabold leading-none", item.tone)}>
                        {`${item.current} / ${item.goal}`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="pt-1">
          <button
            type="button"
            onClick={onRefresh}
            className="min-h-12 w-full rounded-[22px] border border-ink/10 bg-canvas px-4 py-3 text-sm font-semibold text-ink shadow-sm"
          >
            {refreshState.tone === "saving" ? "Refreshing..." : "Refresh"}
        </button>
        {refreshState.message ? (
          <p
            className={classNames(
              "text-xs font-semibold",
              refreshState.tone === "failed" ? "text-danger" : "text-pine"
            )}
          >
            {refreshState.message}
          </p>
        ) : null}
        {lastRefreshedLabel ? (
          <p className="text-xs font-semibold text-ink/60">{`Last refreshed at ${lastRefreshedLabel}`}</p>
        ) : null}
        {isTestRound ? (
          <span className="rounded-full bg-[#FFF1BF] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-ink">
            Test Round
          </span>
        ) : null}
      </div>

      {allTeamsSubmitted ? (
        <>
          <SectionCard className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Good Skins</p>
            {awardedSkins.length ? (
              <div className="space-y-2">
                {awardedSkins.map((hole) => (
                  <div key={hole.holeNumber} className="rounded-[22px] bg-canvas px-4 py-4 text-sm">
                    <p className="font-medium text-ink">{`Hole ${hole.holeNumber} - ${hole.winnerName}`}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink/65">No good skins were won this round.</p>
            )}
          </SectionCard>

          <SectionCard className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Indy Rankings</p>
            {indyRankings.length ? (
              <div className="space-y-2">
                {indyRankings.map((player) => {
                  const isIndyWinner = indyWinnerIds.has(player.playerId);
                  const indyPayout = indyPayoutsByPlayerId.get(player.playerId) ?? 0;

                  return (
                    <div
                      key={`indy-ranking-${player.playerId}`}
                      className={classNames(
                        "rounded-[22px] border px-4 py-3",
                        isIndyWinner ? "border-[#5A9764]/20 bg-[#EAF6EC]" : "border-ink/10 bg-canvas"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="w-6 shrink-0 pt-0.5 text-sm font-semibold text-ink/55">
                            {`${player.rank}.`}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold text-ink">{player.playerName}</p>
                          </div>
                        </div>
                        {indyPayout > 0 ? (
                          <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-pine">
                            {formatCurrency(indyPayout)}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                        <div className="rounded-2xl bg-white px-3 py-2.5">
                          <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Starting quota</p>
                          <p className="mt-1 font-semibold text-ink">{player.startQuota}</p>
                        </div>
                        <div className="rounded-2xl bg-white px-3 py-2.5">
                          <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Points scored</p>
                          <p className="mt-1 font-semibold text-ink">{player.totalPoints}</p>
                        </div>
                        <div className="rounded-2xl bg-white px-3 py-2.5">
                          <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Result</p>
                          <p className={classNames("mt-1 font-semibold", isIndyWinner ? "text-pine" : "text-ink")}>
                            {formatQuotaResult(player.plusMinus)}
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
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Payout Summary</p>
              {paidPlayers.length ? (
                <div className="space-y-2">
                {paidPlayers.map((player) => {
                  const categories = [
                    { label: "Front", value: player.front },
                    { label: "Back", value: player.back },
                    { label: "Total", value: player.total },
                    { label: "Indy", value: player.indy },
                    { label: "Skins", value: player.skins }
                  ].filter((category) => category.value > 0);

                  return (
                    <div key={player.playerId} className="rounded-[22px] bg-canvas px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-base font-semibold text-ink">{player.playerName}</p>
                        <p className="text-lg font-semibold text-pine">{formatCurrency(player.projectedTotal)}</p>
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
              <p className="text-sm text-ink/65">No payouts are settled yet.</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Skins Pot", value: formatCurrency(sideGames.skins.totalPot) },
                { label: "Awarded Skins", value: `${sideGames.skins.totalSkinSharesWon}` },
                { label: "Per Skin", value: formatCurrency(sideGames.skins.valuePerSkin) },
                { label: "Total Paid", value: formatCurrency(sideGames.skins.totalDistributed) }
              ].map((item) => (
                <div key={item.label} className="rounded-[22px] bg-canvas px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">{item.label}</p>
                  <p className="mt-1 text-base font-semibold text-ink">{item.value}</p>
                </div>
              ))}
            </div>
            {sideGames.skins.leftover > 0 ? (
              <div className="rounded-[22px] bg-canvas px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Leftover</p>
                <p className="mt-1 text-base font-semibold text-ink">
                  {`${formatCurrency(sideGames.skins.leftover)} discretionary / possible bartender tip`}
                </p>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Archive Round</p>
            <p className="text-sm text-ink/65">
              Results are ready. Continue to quota confirmation before the round is posted.
            </p>
            <button
              type="button"
              onClick={onArchiveRound}
              disabled={isArchiving}
              className="club-btn-primary min-h-12 w-full rounded-[22px] disabled:opacity-45"
            >
              {isArchiving ? "Loading Quota Changes..." : "Continue"}
            </button>
          </SectionCard>

          {payoutAudit ? (
            <SectionCard className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Pot Check</p>
                <span
                  className={classNames(
                    "rounded-full px-3 py-1.5 text-xs font-semibold",
                    payoutAudit.passed ? "bg-[#E2F4E6] text-pine" : "bg-[#FCE5E2] text-danger"
                  )}
                >
                  {payoutAudit.passed ? "Pot Check Passed" : "Needs Review"}
                </span>
              </div>
              <div className="space-y-2">
                {payoutAudit.checks.map((check) => (
                  <div
                    key={check.label}
                    className={classNames(
                      "rounded-[22px] px-4 py-3",
                      check.passed ? "bg-[#EAF6EC]" : "bg-[#FCE5E2]"
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
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function SkinsOnlyRoundView({
  rows,
  rowStates,
  isTestRound,
  saveState,
  lastSavedAt,
  refreshState,
  lastRefreshedAt,
  onOpenEntry,
  onRefresh
}: SharedProps & {
  onOpenEntry: () => void;
  onRefresh: () => void;
}) {
  const lastRefreshedLabel = formatTimeLabel(lastRefreshedAt);
  const allBackSubmitted = rowStates.length > 0 && rowStates.every((row) => Boolean(row.backSubmittedAt));

  return (
    <div className="space-y-4">
      <SectionCard className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Skins Only</p>
            <h3 className="mt-1 text-xl font-semibold">Score entry only</h3>
          </div>
          <button
            type="button"
            onClick={onOpenEntry}
            className="min-h-12 rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white"
          >
            Enter Scores
          </button>
        </div>
      </SectionCard>

      <div className="flex flex-col items-center gap-1.5 pt-1">
        <button
          type="button"
          onClick={onRefresh}
          className="min-h-12 w-full rounded-[22px] border border-ink/10 bg-canvas px-4 py-3 text-sm font-semibold text-ink shadow-sm"
        >
          {refreshState.tone === "saving" ? "Refreshing..." : "Refresh"}
        </button>
        {refreshState.message ? (
          <p
            className={classNames(
              "text-xs font-semibold",
              refreshState.tone === "failed" ? "text-danger" : "text-pine"
            )}
          >
            {refreshState.message}
          </p>
        ) : null}
        {lastRefreshedLabel ? (
          <p className="text-xs font-semibold text-ink/60">{`Last refreshed at ${lastRefreshedLabel}`}</p>
        ) : null}
        {isTestRound ? (
          <span className="rounded-full bg-[#FFF1BF] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-ink">
            Test Round
          </span>
        ) : null}
      </div>
    </div>
  );
}





