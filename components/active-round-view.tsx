"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SectionCard } from "@/components/section-card";
import {
  formatPlusMinus,
  type CalculatedRoundRow,
  type PlayerBuyInSummary,
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

function PlayersOwingSection({
  roundId,
  buyIns,
  initialBuyInPaidPlayerIds
}: {
  roundId: string;
  buyIns: PlayerBuyInSummary;
  initialBuyInPaidPlayerIds: string[];
}) {
  const router = useRouter();
  const [paidInPlayerIds, setPaidInPlayerIds] = useState(initialBuyInPaidPlayerIds);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  if (!buyIns.players.length) {
    return null;
  }

  const collectedTotal = buyIns.players.reduce(
    (sum, player) => sum + (paidInPlayerIds.includes(player.playerId) ? player.totalOwed : 0),
    0
  );
  const totalOwed = buyIns.players.reduce((sum, player) => sum + player.totalOwed, 0);
  const unpaidPlayers = buyIns.players.filter((player) => !paidInPlayerIds.includes(player.playerId));

  function markPaid(playerId: string) {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/rounds/${roundId}/settlement`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            action: "toggle-buy-in-paid",
            playerId
          })
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error ?? "Could not update buy-in status.");
        }

        setPaidInPlayerIds(result.buyInPaidPlayerIds ?? []);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not update buy-in status.");
      }
    });
  }

  return (
    <SectionCard className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Players Owing</p>
          <h3 className="mt-1 text-lg font-semibold">Who still owes money?</h3>
        </div>
        <div className="rounded-2xl bg-canvas px-4 py-3 text-right">
          <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Collected</p>
          <p className="mt-1 text-xl font-semibold">{`$${collectedTotal} / $${totalOwed}`}</p>
        </div>
      </div>

      {message ? <p className="text-sm font-medium text-ink/70">{message}</p> : null}

      {unpaidPlayers.length ? (
        <div className="space-y-2">
          {unpaidPlayers.map((player) => (
            <div key={player.playerId} className="rounded-[22px] border border-ink/10 bg-canvas px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-ink">{player.playerName}</p>
                  <p className="mt-1 text-sm text-ink/65">{`$${player.totalOwed}`}</p>
                </div>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => markPaid(player.playerId)}
                  className="club-btn-primary min-h-11 rounded-2xl px-4 text-sm font-semibold disabled:opacity-45"
                >
                  Mark Paid
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-[22px] border border-[#5A9764]/25 bg-[#E2F4E6] px-4 py-4 text-center">
          <p className="text-base font-semibold text-pine">All players paid in</p>
        </div>
      )}
    </SectionCard>
  );
}

type SharedProps = {
  roundId: string;
  rows: CalculatedRoundRow[];
  rowStates: RowSubmissionState[];
  playerBuyIns: PlayerBuyInSummary;
  initialBuyInPaidPlayerIds: string[];
  isTestRound: boolean;
  saveState: SaveState;
  lastSavedAt: string | null;
  onDeleteRound: () => void;
  onForceDeleteRound: () => void;
  onSubmitSegment: (playerId: string, segment: "front" | "back") => void;
};

export function MatchRoundView({
  roundId,
  rows,
  rowStates,
  teamStandings,
  teamRowsByCode,
  playerBuyIns,
  initialBuyInPaidPlayerIds,
  isTestRound,
  saveState,
  lastSavedAt,
  onDeleteRound,
  onForceDeleteRound,
  onOpenTeam,
  onSubmitSegment
}: SharedProps & {
  teamStandings: TeamStanding[];
  teamRowsByCode: Map<TeamCode, CalculatedRoundRow[]>;
  onOpenTeam: (team: TeamCode) => void;
}) {
  const allFrontSubmitted = rowStates.length > 0 && rowStates.every((row) => Boolean(row.frontSubmittedAt));
  const allBackSubmitted = rowStates.length > 0 && rowStates.every((row) => Boolean(row.backSubmittedAt));
  const lastSavedLabel = formatTimeLabel(lastSavedAt);

  function getWinningTeams(key: "frontPlusMinus" | "backPlusMinus" | "totalPlusMinus") {
    if (!teamStandings.length) return [];
    const best = Math.max(...teamStandings.map((team) => team[key]));
    return teamStandings.filter((team) => team[key] === best);
  }

  const frontWinners = allFrontSubmitted ? getWinningTeams("frontPlusMinus") : [];
  const backWinners = allBackSubmitted ? getWinningTeams("backPlusMinus") : [];
  const totalWinners = allBackSubmitted ? getWinningTeams("totalPlusMinus") : [];

  return (
    <div className="space-y-4">
      <SectionCard className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Score Save Status</p>
            <h3 className="mt-1 text-lg font-semibold">
              {saveState.tone === "saving"
                ? "Saving..."
                : saveState.tone === "failed"
                  ? "Save failed"
                  : saveState.tone === "saved"
                    ? "Saved"
                    : "Ready to score"}
            </h3>
            <p className="mt-1 text-sm text-ink/75">
              {saveState.message || "Scores only show as saved after the server confirms the write."}
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
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Submission Status</p>
          <h3 className="mt-1 text-lg font-semibold">Who has officially submitted?</h3>
        </div>
        <div className="space-y-2">
          {rows.map((row) => {
            const rowState = rowStates.find((candidate) => candidate.playerId === row.playerId);
            const frontReady = hasCompletedSegment(row.holeScores, 0, 9);
            const backReady = hasCompletedSegment(row.holeScores, 9, 18);
            const frontSubmittedLabel = formatTimeLabel(rowState?.frontSubmittedAt ?? null);
            const backSubmittedLabel = formatTimeLabel(rowState?.backSubmittedAt ?? null);

            return (
              <div key={row.playerId} className="rounded-[22px] border border-ink/10 bg-canvas px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-ink">{row.playerName}</p>
                    <div className="mt-2 space-y-1 text-sm text-ink/70">
                      <p>
                        {frontSubmittedLabel
                          ? `Front submitted at ${frontSubmittedLabel}`
                          : frontReady
                            ? "Front ready to submit"
                            : "Front nine still in progress"}
                      </p>
                      <p>
                        {backSubmittedLabel
                          ? `Back submitted at ${backSubmittedLabel}`
                          : backReady
                            ? "Back ready to submit"
                            : rowState?.frontSubmittedAt
                              ? "Back nine still in progress"
                              : "Back locked until front is submitted"}
                      </p>
                    </div>
                  </div>
                  {!rowState?.frontSubmittedAt ? (
                    <button
                      type="button"
                      disabled={!frontReady}
                      onClick={() => onSubmitSegment(row.playerId, "front")}
                      className="club-btn-primary min-h-11 rounded-2xl px-4 text-sm font-semibold disabled:opacity-45"
                    >
                      Submit Front Nine
                    </button>
                  ) : !rowState?.backSubmittedAt ? (
                    <button
                      type="button"
                      disabled={!backReady}
                      onClick={() => onSubmitSegment(row.playerId, "back")}
                      className="club-btn-primary min-h-11 rounded-2xl px-4 text-sm font-semibold disabled:opacity-45"
                    >
                      Submit Back Nine
                    </button>
                  ) : (
                    <span className="rounded-full bg-[#E2F4E6] px-3 py-1.5 text-xs font-semibold text-pine">Submitted</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Round Results</p>
        {!allFrontSubmitted ? (
          <p className="text-sm text-ink/70">Waiting for remaining front-nine submissions.</p>
        ) : (
          <div className="rounded-[22px] bg-canvas px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Front Winner</p>
            <p className="mt-1 text-base font-semibold">
              {frontWinners.length ? frontWinners.map((team) => `Team ${team.team}`).join(", ") : "No winner"}
            </p>
          </div>
        )}
        {!allBackSubmitted ? (
          <p className="text-sm text-ink/70">Waiting for remaining back-nine submissions.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-[22px] bg-canvas px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Back Winner</p>
              <p className="mt-1 text-base font-semibold">
                {backWinners.length ? backWinners.map((team) => `Team ${team.team}`).join(", ") : "No winner"}
              </p>
            </div>
            <div className="rounded-[22px] bg-canvas px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Total Winner</p>
              <p className="mt-1 text-base font-semibold">
                {totalWinners.length ? totalWinners.map((team) => `Team ${team.team}`).join(", ") : "No winner"}
              </p>
            </div>
          </div>
        )}
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
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  { label: "Front", value: team.frontPlusMinus },
                  { label: "Back", value: team.backPlusMinus },
                  { label: "Total", value: team.totalPlusMinus }
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl bg-canvas px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">{item.label}</p>
                    <p className="mt-1 text-lg font-semibold">{formatPlusMinus(item.value)}</p>
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <PlayersOwingSection
        roundId={roundId}
        buyIns={playerBuyIns}
        initialBuyInPaidPlayerIds={initialBuyInPaidPlayerIds}
      />

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
  roundId,
  rows,
  rowStates,
  playerBuyIns,
  initialBuyInPaidPlayerIds,
  isTestRound,
  saveState,
  lastSavedAt,
  onDeleteRound,
  onForceDeleteRound,
  onOpenEntry,
  onSubmitSegment
}: SharedProps & {
  onOpenEntry: () => void;
}) {
  const lastSavedLabel = formatTimeLabel(lastSavedAt);

  return (
    <div className="space-y-4">
      <SectionCard className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Score Save Status</p>
            <h3 className="mt-1 text-lg font-semibold">
              {saveState.tone === "saving"
                ? "Saving..."
                : saveState.tone === "failed"
                  ? "Save failed"
                  : saveState.tone === "saved"
                    ? "Saved"
                    : "Ready to score"}
            </h3>
            <p className="mt-1 text-sm text-ink/75">
              {saveState.message || "Scores only show as saved after the server confirms the write."}
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
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Submission Status</p>
        <div className="space-y-2">
          {rows.map((row) => {
            const rowState = rowStates.find((candidate) => candidate.playerId === row.playerId);
            const completedHoles = row.holeScores.filter((score) => score != null).length;
            const frontReady = hasCompletedSegment(row.holeScores, 0, 9);
            const backReady = hasCompletedSegment(row.holeScores, 9, 18);
            const frontSubmittedLabel = formatTimeLabel(rowState?.frontSubmittedAt ?? null);
            const backSubmittedLabel = formatTimeLabel(rowState?.backSubmittedAt ?? null);
            const playerComplete = hasRecordedFinalHole(row.holeScores);

            return (
              <div key={row.playerId} className="rounded-2xl bg-canvas px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold">{row.playerName}</p>
                    <p className="mt-1 text-xs text-ink/60">{`${row.totalPoints} points`}</p>
                    <p className="mt-2 text-sm text-ink/70">
                      {frontSubmittedLabel
                        ? `Front submitted at ${frontSubmittedLabel}`
                        : frontReady
                          ? "Front ready to submit"
                          : "Front nine still in progress"}
                    </p>
                    <p className="mt-1 text-sm text-ink/70">
                      {backSubmittedLabel
                        ? `Back submitted at ${backSubmittedLabel}`
                        : backReady
                          ? "Back ready to submit"
                          : rowState?.frontSubmittedAt
                            ? "Back nine still in progress"
                            : "Back locked until front is submitted"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold">{row.totalPoints}</p>
                    <p className="mt-1 text-xs text-ink/60">
                      {playerComplete ? "Completed" : `Next Hole ${Math.min(completedHoles + 1, 18)}`}
                    </p>
                  </div>
                </div>
                <div className="mt-3">
                  {!rowState?.frontSubmittedAt ? (
                    <button
                      type="button"
                      disabled={!frontReady}
                      onClick={() => onSubmitSegment(row.playerId, "front")}
                      className="club-btn-primary min-h-11 w-full rounded-2xl px-4 text-sm font-semibold disabled:opacity-45"
                    >
                      Submit Front Nine
                    </button>
                  ) : !rowState?.backSubmittedAt ? (
                    <button
                      type="button"
                      disabled={!backReady}
                      onClick={() => onSubmitSegment(row.playerId, "back")}
                      className="club-btn-primary min-h-11 w-full rounded-2xl px-4 text-sm font-semibold disabled:opacity-45"
                    >
                      Submit Back Nine
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <PlayersOwingSection
        roundId={roundId}
        buyIns={playerBuyIns}
        initialBuyInPaidPlayerIds={initialBuyInPaidPlayerIds}
      />

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
