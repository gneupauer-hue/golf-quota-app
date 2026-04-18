"use client";

import { SectionCard } from "@/components/section-card";
import { type CalculatedRoundRow, type TeamCode, type TeamStanding } from "@/lib/quota";
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

function hasCompletedSegment(holeScores: Array<number | null>, startIndex: number, endIndex: number) {
  return holeScores.slice(startIndex, endIndex).every((score) => score != null);
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
  onDeleteRound: () => void;
  onForceDeleteRound: () => void;
};

export function MatchRoundView({
  rows,
  rowStates,
  teamStandings,
  teamRowsByCode,
  isTestRound,
  saveState,
  lastSavedAt,
  onDeleteRound,
  onForceDeleteRound,
  onOpenTeam
}: SharedProps & {
  teamStandings: TeamStanding[];
  teamRowsByCode: Map<TeamCode, CalculatedRoundRow[]>;
  onOpenTeam: (team: TeamCode) => void;
}) {
  const lastSavedLabel = formatTimeLabel(lastSavedAt);
  const allBackSubmitted = rowStates.length > 0 && rowStates.every((row) => Boolean(row.backSubmittedAt));
  const allTeamsComplete =
    teamStandings.length > 0 &&
    teamStandings.every((team) => {
      const teamRows = teamRowsByCode.get(team.team) ?? [];
      return teamRows.length > 0 && teamRows.every((row) => hasRecordedFinalHole(row.holeScores));
    });

  return (
    <div className="space-y-4">
      <SectionCard className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Score Save Status</p>
            <h3 className="mt-1 text-lg font-semibold">
              {allBackSubmitted || allTeamsComplete
                ? "All teams submitted"
                : saveState.tone === "saving"
                ? "Saving..."
                : saveState.tone === "failed"
                  ? "Save failed"
                  : saveState.tone === "saved"
                    ? "Saved"
                    : "Ready to score"}
            </h3>
            <p className="mt-1 text-sm text-ink/75">
              {allBackSubmitted || allTeamsComplete
                ? "Round finalization is in progress or this round has already been submitted."
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
          const teamComplete = teamRows.length > 0 && teamRows.every((row) => hasRecordedFinalHole(row.holeScores));
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
                  {teamComplete ? (
                    <span className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#E2F4E6] px-3 py-1.5 text-xs font-semibold text-pine">
                      <span aria-hidden="true">✓</span>
                      Team Complete
                    </span>
                  ) : null}
                </div>
                <div className={classNames("rounded-2xl px-4 py-3 text-center", teamComplete ? "bg-[#E2F4E6]" : "bg-canvas")}>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">
                    {teamComplete ? "Status" : "Next Hole"}
                  </p>
                  <p className="mt-1 text-2xl font-semibold">{teamComplete ? "Completed" : Math.min(progress + 1, 18)}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <SectionCard className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Round Controls</p>
        <p className="text-sm text-ink/65">The round finalizes automatically when the last back nine is submitted.</p>
      </SectionCard>

      <SectionCard className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Round Admin</p>
        <button
          type="button"
          onClick={onForceDeleteRound}
          className="min-h-12 w-full rounded-[22px] border border-danger/25 bg-white px-4 text-sm font-semibold text-danger"
        >
          Force Clear Active Round
        </button>
        <button
          type="button"
          onClick={onDeleteRound}
          className="min-h-12 w-full rounded-[22px] bg-danger/12 px-4 text-sm font-semibold text-danger"
        >
          {isTestRound ? "Delete Test Round" : "Cancel Current Round"}
        </button>
      </SectionCard>
    </div>
  );
}

export function SkinsOnlyRoundView({
  rows,
  rowStates,
  isTestRound,
  saveState,
  lastSavedAt,
  onDeleteRound,
  onForceDeleteRound,
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
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Score Save Status</p>
            <h3 className="mt-1 text-lg font-semibold">
              {allBackSubmitted || allPlayersComplete
                ? "All players submitted"
                : saveState.tone === "saving"
                ? "Saving..."
                : saveState.tone === "failed"
                  ? "Save failed"
                  : saveState.tone === "saved"
                    ? "Saved"
                    : "Ready to score"}
            </h3>
            <p className="mt-1 text-sm text-ink/75">
              {allBackSubmitted || allPlayersComplete
                ? "Round finalization is in progress or this round has already been submitted."
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
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Round Admin</p>
        <button
          type="button"
          onClick={onForceDeleteRound}
          className="min-h-12 w-full rounded-[22px] border border-danger/25 bg-white px-4 text-sm font-semibold text-danger"
        >
          Force Clear Active Round
        </button>
        <button
          type="button"
          onClick={onDeleteRound}
          className="min-h-12 w-full rounded-[22px] bg-danger/12 px-4 text-sm font-semibold text-danger"
        >
          {isTestRound ? "Delete Test Round" : "Cancel Current Round"}
        </button>
      </SectionCard>
    </div>
  );
}
