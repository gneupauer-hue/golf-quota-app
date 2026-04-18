"use client";

import { SectionCard } from "@/components/section-card";
import {
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

type SharedProps = {
  rows: CalculatedRoundRow[];
  rowStates: RowSubmissionState[];
  isTestRound: boolean;
  saveState: SaveState;
  lastSavedAt: string | null;
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

export function MatchRoundView({
  rows,
  rowStates,
  teamStandings,
  teamRowsByCode,
  sideGames,
  payoutSummary,
  isTestRound,
  saveState,
  lastSavedAt,
  isArchiving,
  onArchiveRound,
  onOpenTeam
}: SharedProps & {
  teamStandings: TeamStanding[];
  teamRowsByCode: Map<TeamCode, CalculatedRoundRow[]>;
  sideGames: SideGameResults;
  payoutSummary: PayoutPredictionsSummary;
  isArchiving: boolean;
  onArchiveRound: () => void;
  onOpenTeam: (team: TeamCode) => void;
}) {
  const lastSavedLabel = formatTimeLabel(lastSavedAt);
  const allTeamsComplete =
    teamStandings.length > 0 &&
    teamStandings.every((team) => {
      const teamRows = teamRowsByCode.get(team.team) ?? [];
      return teamRows.length > 0 && teamRows.every((row) => hasRecordedFinalHole(row.holeScores));
    });
  const allTeamsSubmitted =
    teamStandings.length > 0 &&
    teamStandings.every((team) => getTeamSubmissionState(teamRowsByCode.get(team.team) ?? [], rowStates));
  const awardedSkins = allTeamsSubmitted
    ? sideGames.skins.holes.filter((hole) => hole.skinAwarded && hole.winnerName)
    : [];
  const paidPlayers = allTeamsSubmitted
    ? payoutSummary.players.filter((player) => player.projectedTotal > 0)
    : [];

  function getWinningTeams(key: "frontPlusMinus" | "backPlusMinus" | "totalPlusMinus") {
    if (!teamStandings.length) return [];
    const best = Math.max(...teamStandings.map((team) => team[key]));
    return teamStandings.filter((team) => team[key] === best);
  }

  const frontWinners = allTeamsSubmitted ? getWinningTeams("frontPlusMinus") : [];
  const backWinners = allTeamsSubmitted ? getWinningTeams("backPlusMinus") : [];
  const totalWinners = allTeamsSubmitted ? getWinningTeams("totalPlusMinus") : [];

  function renderTeamComparison(
    label: string,
    key: "frontPlusMinus" | "backPlusMinus" | "totalPlusMinus",
    winners: TeamStanding[]
  ) {
    const winnerCodes = new Set(winners.map((team) => team.team));
    const sortedTeams = [...teamStandings].sort((left, right) => {
      if (right[key] !== left[key]) {
        return right[key] - left[key];
      }
      return left.team.localeCompare(right.team);
    });

    return (
      <div className="rounded-[22px] bg-canvas px-4 py-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">{label}</p>
        <div className="mt-2 space-y-2">
          {sortedTeams.map((team) => {
            const isWinner = winnerCodes.has(team.team);
            return (
              <div
                key={`${label}-${team.team}`}
                className={classNames(
                  "flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5",
                  isWinner ? "border border-[#5A9764]/20 bg-[#EAF6EC]" : "bg-white"
                )}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{`Team ${team.team}`}</p>
                  {isWinner ? (
                    <span className="mt-1 inline-flex items-center rounded-full bg-pine/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-pine">
                      Winner
                    </span>
                  ) : null}
                </div>
                <p className="text-lg font-semibold text-ink">{formatPlusMinus(team[key])}</p>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionCard className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Round Status</p>
            <h3 className="mt-1 text-lg font-semibold">
              {allTeamsSubmitted
                ? "All teams submitted"
                : allTeamsComplete
                  ? "Final scores ready for submission"
                  : saveState.tone === "saving"
                    ? "Saving..."
                    : saveState.tone === "failed"
                      ? "Save failed"
                      : saveState.tone === "saved"
                        ? "Saved"
                        : "Ready to score"}
            </h3>
            <p className="mt-1 text-sm text-ink/75">
              {allTeamsSubmitted
                ? "Review the final results below, then archive the round when you're ready."
                : allTeamsComplete
                  ? "All teams have reached hole 18. Open a team card to submit final scores."
                  : saveState.message || "Scores only show as saved after the server confirms the write."}
            </p>
            {lastSavedLabel ? (
              <p className="mt-2 text-xs font-semibold text-pine">{`Last saved at ${lastSavedLabel}`}</p>
            ) : null}
          </div>
          {isTestRound ? (
            <span className="rounded-full bg-[#FFF1BF] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-ink">
              Test Round
            </span>
          ) : null}
        </div>
      </SectionCard>

      <div className="space-y-3">
        {teamStandings.map((team) => {
          const teamRows = teamRowsByCode.get(team.team) ?? [];
          const progress = getTeamProgress(teamRows);
          const teamSubmitted = getTeamSubmissionState(teamRows, rowStates);
          return (
            <button
              key={team.team}
              type="button"
              onClick={() => onOpenTeam(team.team)}
              className="w-full rounded-[28px] border border-ink/10 bg-white/90 px-4 py-4 text-left shadow-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-2xl font-semibold">{`Team ${team.team}`}</p>
                  <p className="mt-1 text-sm text-ink/60">{team.players.join(", ")}</p>
                  {teamSubmitted ? (
                    <span className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#E2F4E6] px-3 py-1.5 text-xs font-semibold text-pine">
                      <span aria-hidden="true">✔</span>
                      Submitted
                    </span>
                  ) : null}
                </div>
                <div className={classNames("rounded-2xl px-4 py-3 text-center", teamSubmitted ? "bg-[#E2F4E6]" : "bg-canvas")}>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">
                    {teamSubmitted ? "Status" : "Next Hole"}
                  </p>
                  <p className="mt-1 text-2xl font-semibold">
                    {teamSubmitted ? "Submitted" : Math.min(progress + 1, 18)}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {allTeamsSubmitted ? (
        <>
          <SectionCard className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Final Results</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {renderTeamComparison("Front", "frontPlusMinus", frontWinners)}
              {renderTeamComparison("Back", "backPlusMinus", backWinners)}
              {renderTeamComparison("Total", "totalPlusMinus", totalWinners)}
            </div>
            <div className="rounded-[22px] bg-canvas px-4 py-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Good Skins</p>
              {awardedSkins.length ? (
                <div className="mt-2 space-y-2">
                  {awardedSkins.map((hole) => (
                    <div key={hole.holeNumber} className="flex items-center justify-between gap-3 text-sm">
                      <p className="font-medium text-ink">{`Hole ${hole.holeNumber} - ${hole.winnerName}`}</p>
                      <p className="font-semibold text-pine">{formatCurrency(hole.holePayout)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-ink/65">No good skins were won this round.</p>
              )}
            </div>
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
          </SectionCard>

          <SectionCard className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Archive Round</p>
            <p className="text-sm text-ink/65">
              Archiving is the final step. It moves this round to Past Games, updates quotas, and clears the active round.
            </p>
            <button
              type="button"
              onClick={onArchiveRound}
              disabled={isArchiving}
              className="club-btn-primary min-h-12 w-full rounded-[22px] disabled:opacity-45"
            >
              {isArchiving ? "Archiving Round..." : "Archive Round"}
            </button>
          </SectionCard>
        </>
      ) : (
        <SectionCard className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Round Controls</p>
          <p className="text-sm text-ink/65">
            Current Round is now score-entry only. Team submission happens inside each team flow.
          </p>
        </SectionCard>
      )}
    </div>
  );
}

export function SkinsOnlyRoundView({
  rows,
  rowStates,
  isTestRound,
  saveState,
  lastSavedAt,
  onOpenEntry
}: SharedProps & {
  onOpenEntry: () => void;
}) {
  const lastSavedLabel = formatTimeLabel(lastSavedAt);
  const allBackSubmitted = rowStates.length > 0 && rowStates.every((row) => Boolean(row.backSubmittedAt));
  const allPlayersComplete = rows.length > 0 && rows.every((row) => hasRecordedFinalHole(row.holeScores));

  return (
    <div className="space-y-4">
      <SectionCard className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Round Status</p>
            <h3 className="mt-1 text-lg font-semibold">
              {allBackSubmitted
                ? "All players submitted"
                : allPlayersComplete
                  ? "Final scores ready for submission"
                  : saveState.tone === "saving"
                    ? "Saving..."
                    : saveState.tone === "failed"
                      ? "Save failed"
                      : saveState.tone === "saved"
                        ? "Saved"
                        : "Ready to score"}
            </h3>
            <p className="mt-1 text-sm text-ink/75">
              {allBackSubmitted
                ? "All players have submitted. Archive this round from the final results flow when you're ready."
                : allPlayersComplete
                  ? "Everyone has reached hole 18. Open score entry to submit final scores."
                  : saveState.message || "Scores only show as saved after the server confirms the write."}
            </p>
            {lastSavedLabel ? (
              <p className="mt-2 text-xs font-semibold text-pine">{`Last saved at ${lastSavedLabel}`}</p>
            ) : null}
          </div>
          {isTestRound ? (
            <span className="rounded-full bg-[#FFF1BF] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-ink">
              Test Round
            </span>
          ) : null}
        </div>
      </SectionCard>

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

      <SectionCard className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Round Controls</p>
        <p className="text-sm text-ink/65">
          Current Round is now score-entry only. Round admin actions live on Home now.
        </p>
      </SectionCard>
    </div>
  );
}
