"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SectionCard } from "@/components/section-card";
import { type CalculatedRoundRow, type PlayerBuyInSummary, type TeamCode, type TeamStanding } from "@/lib/quota";
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
