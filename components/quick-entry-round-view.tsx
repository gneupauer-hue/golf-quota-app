"use client";

import { useEffect, useMemo, useState } from "react";
import { SectionCard } from "@/components/section-card";
import {
  formatBirdieHolesInput,
  formatPlusMinus,
  holeNumbers,
  parseBirdieHolesInput,
  type TeamCode
} from "@/lib/quota";
import { classNames } from "@/lib/utils";

type SaveState = {
  tone: "idle" | "saving" | "saved" | "failed";
  message: string;
};

type QuickEntryRow = {
  playerId: string;
  playerName: string;
  team: TeamCode | null;
  startQuota: number;
  quickFrontNine: number | null;
  quickBackNine: number | null;
  birdieHolesText: string;
  totalPoints: number;
  plusMinus: number;
  nextQuota: number;
};

type SummaryRow = QuickEntryRow & {
  birdieHoles: number[];
};

function formatTimeLabel(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatQuotaResult(value: number) {
  return value === 0 ? "Even" : formatPlusMinus(value);
}

function formatSkinHoles(holes: number[]) {
  return holes.length ? holes.join(", ") : "None";
}

function getStatusClasses(tone: SaveState["tone"]) {
  if (tone === "failed") return "bg-[#FCE5E2] text-danger";
  if (tone === "saved") return "bg-[#EAF6EC] text-pine";
  if (tone === "saving") return "bg-[#FFF1BF] text-ink";
  return "bg-canvas text-ink/70";
}

function getChangeBadgeClasses(value: number) {
  if (value > 0) return "bg-[#1B6B3A] text-white";
  if (value < 0) return "bg-[#B54545] text-white";
  return "bg-canvas text-ink";
}

function getBirdieHoleClasses(selected: boolean) {
  return selected
    ? "bg-[#1B6B3A] text-white border-[#1B6B3A]"
    : "bg-white text-ink/70 border-sand/70";
}

export function QuickEntryRoundView({
  rows,
  saveState,
  lastSavedAt,
  refreshState,
  lastRefreshedAt,
  isArchiving,
  onFrontNineChange,
  onBackNineChange,
  onBirdieHolesChange,
  onSaveRound,
  onArchiveRound,
  onRefresh
}: {
  rows: QuickEntryRow[];
  saveState: SaveState;
  lastSavedAt: string | null;
  refreshState: SaveState;
  lastRefreshedAt: string | null;
  isArchiving: boolean;
  allEntriesComplete: boolean;
  onFrontNineChange: (playerId: string, value: string) => void;
  onBackNineChange: (playerId: string, value: string) => void;
  onBirdieHolesChange: (playerId: string, value: string) => void;
  onSaveRound: () => void;
  onArchiveRound: () => void;
  onRefresh: () => void;
}) {
  const [completedPlayerIds, setCompletedPlayerIds] = useState<string[]>([]);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [playerConfirmId, setPlayerConfirmId] = useState<string | null>(null);
  const [isFinalConfirmOpen, setIsFinalConfirmOpen] = useState(false);

  const lastSavedLabel = formatTimeLabel(lastSavedAt);
  const lastRefreshedLabel = formatTimeLabel(lastRefreshedAt);

  const summaryRows = useMemo<SummaryRow[]>(
    () =>
      rows.map((row) => ({
        ...row,
        birdieHoles: parseBirdieHolesInput(row.birdieHolesText)
      })),
    [rows]
  );

  const rowIds = useMemo(() => rows.map((row) => row.playerId), [rows]);
  const completedSet = useMemo(() => new Set(completedPlayerIds), [completedPlayerIds]);
  const completedRows = summaryRows.filter((row) => completedSet.has(row.playerId));
  const incompleteRows = summaryRows.filter((row) => !completedSet.has(row.playerId));
  const activeRow = summaryRows.find((row) => row.playerId === activePlayerId) ?? incompleteRows[0] ?? null;
  const activePlayerNumber = activeRow ? rowIds.indexOf(activeRow.playerId) + 1 : rows.length;
  const playerConfirmRow = summaryRows.find((row) => row.playerId === playerConfirmId) ?? null;
  const allPlayersComplete = rows.length > 0 && completedRows.length === rows.length;

  useEffect(() => {
    setCompletedPlayerIds((current) => current.filter((playerId) => rowIds.includes(playerId)));
  }, [rowIds]);

  useEffect(() => {
    if (!rows.length) {
      setActivePlayerId(null);
      return;
    }

    if (activePlayerId && rowIds.includes(activePlayerId) && !completedSet.has(activePlayerId)) {
      return;
    }

    setActivePlayerId(incompleteRows[0]?.playerId ?? null);
  }, [activePlayerId, completedSet, incompleteRows, rowIds, rows.length]);

  function toggleBirdieHole(row: SummaryRow, holeNumber: number) {
    const nextHoles = row.birdieHoles.includes(holeNumber)
      ? row.birdieHoles.filter((value) => value !== holeNumber)
      : [...row.birdieHoles, holeNumber];

    onBirdieHolesChange(row.playerId, formatBirdieHolesInput(nextHoles));
  }

  function editCompletedPlayer(playerId: string) {
    setCompletedPlayerIds((current) => current.filter((candidate) => candidate !== playerId));
    setActivePlayerId(playerId);
    setPlayerConfirmId(null);
    setIsFinalConfirmOpen(false);
  }

  function handleSavePlayerScore() {
    if (!activeRow || isArchiving) return;

    if (activeRow.quickFrontNine == null || activeRow.quickBackNine == null) {
      return;
    }

    setPlayerConfirmId(activeRow.playerId);
  }

  function confirmPlayerScore() {
    if (!playerConfirmRow) return;

    const confirmedId = playerConfirmRow.playerId;
    setCompletedPlayerIds((current) =>
      current.includes(confirmedId) ? current : [...current, confirmedId]
    );
    setPlayerConfirmId(null);
    onSaveRound();

    const nextIncomplete = summaryRows.find(
      (row) => row.playerId !== confirmedId && !completedSet.has(row.playerId)
    );
    setActivePlayerId(nextIncomplete?.playerId ?? null);
  }

  function handleFinalSubmit() {
    if (!allPlayersComplete || isArchiving) return;
    setIsFinalConfirmOpen(true);
  }

  function confirmFinalRound() {
    setIsFinalConfirmOpen(false);
    onArchiveRound();
  }

  return (
    <>
      <div className="space-y-3.5">
        <SectionCard className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Scorecard Entry</p>
              <h3 className="mt-1 text-lg font-semibold text-ink">Enter one player at a time</h3>
              <p className="mt-1 text-sm text-ink/70">
                Completed {completedRows.length} of {rows.length}
              </p>
            </div>
            <button type="button" className="club-btn-secondary min-h-10 px-4 text-sm" onClick={onRefresh}>
              Refresh
            </button>
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-medium text-ink/70">
            {activeRow ? <span>Player {activePlayerNumber} of {rows.length}</span> : null}
            {saveState.message ? (
              <span className={classNames("rounded-full px-3 py-1.5", getStatusClasses(saveState.tone))}>
                {saveState.message}
              </span>
            ) : null}
            {refreshState.message ? (
              <span className={classNames("rounded-full px-3 py-1.5", getStatusClasses(refreshState.tone))}>
                {refreshState.message}
              </span>
            ) : null}
            {lastSavedLabel ? <span>Saved {lastSavedLabel}</span> : null}
            {lastRefreshedLabel ? <span>Updated {lastRefreshedLabel}</span> : null}
          </div>
        </SectionCard>

        {activeRow ? (
          <SectionCard className="space-y-4 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-xl font-semibold text-ink">{activeRow.playerName}</h3>
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink/60">
                  <span className="rounded-full bg-canvas px-2.5 py-1">Quota {activeRow.startQuota}</span>
                  {activeRow.team ? <span className="rounded-full bg-canvas px-2.5 py-1">Team {activeRow.team}</span> : null}
                </div>
              </div>
              <div className="rounded-[20px] bg-canvas px-3 py-2.5 text-right">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/45">Total</p>
                <p className="mt-1 text-lg font-semibold text-ink">{activeRow.totalPoints}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <label className="space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/55">Front 9</span>
                <input
                  type="number"
                  inputMode="numeric"
                  className="h-14 w-full rounded-2xl border border-sand/70 bg-white px-3 text-lg text-ink outline-none transition focus:border-pine/50"
                  value={activeRow.quickFrontNine ?? ""}
                  onChange={(event) => onFrontNineChange(activeRow.playerId, event.target.value)}
                  placeholder="0"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/55">Back 9</span>
                <input
                  type="number"
                  inputMode="numeric"
                  className="h-14 w-full rounded-2xl border border-sand/70 bg-white px-3 text-lg text-ink outline-none transition focus:border-pine/50"
                  value={activeRow.quickBackNine ?? ""}
                  onChange={(event) => onBackNineChange(activeRow.playerId, event.target.value)}
                  placeholder="0"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl bg-white px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">Quota result</p>
                <p className="mt-2 text-base font-semibold text-ink">{formatQuotaResult(activeRow.plusMinus)}</p>
              </div>
              <div className="rounded-2xl bg-white px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">Next quota</p>
                <p className={classNames("mt-2 inline-flex rounded-full px-2.5 py-1 text-sm font-semibold", getChangeBadgeClasses(activeRow.nextQuota - activeRow.startQuota))}>
                  {activeRow.nextQuota}
                </p>
              </div>
            </div>

            <div className="space-y-2 rounded-[22px] bg-canvas/70 px-3.5 py-3.5">
              <p className="text-sm font-semibold text-ink">Skin holes</p>
              <div className="grid grid-cols-6 gap-2">
                {holeNumbers.map((holeNumber) => {
                  const selected = activeRow.birdieHoles.includes(holeNumber);
                  return (
                    <button
                      key={`${activeRow.playerId}-${holeNumber}`}
                      type="button"
                      className={classNames("min-h-11 rounded-2xl border text-sm font-semibold transition", getBirdieHoleClasses(selected))}
                      onClick={() => toggleBirdieHole(activeRow, holeNumber)}
                    >
                      {holeNumber}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              className="club-btn-primary min-h-14 w-full text-base disabled:opacity-60"
              disabled={isArchiving || activeRow.quickFrontNine == null || activeRow.quickBackNine == null}
              onClick={handleSavePlayerScore}
            >
              Save Player Score
            </button>
          </SectionCard>
        ) : (
          <SectionCard className="space-y-2 border border-pine/20 bg-[#E2F4E6]">
            <h3 className="text-lg font-semibold text-ink">All players completed</h3>
            <p className="text-sm text-ink/70">Review the completed list, then submit all scores.</p>
          </SectionCard>
        )}

        <SectionCard className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-ink">Completed Players</h3>
            <span className="text-sm font-semibold text-ink/60">{completedRows.length}/{rows.length}</span>
          </div>
          {completedRows.length ? (
            <div className="space-y-2">
              {completedRows.map((row) => (
                <div key={`completed-${row.playerId}`} className="rounded-2xl bg-white px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{row.playerName}</p>
                      <p className="mt-1 text-xs text-ink/60">
                        {row.totalPoints} pts | {formatQuotaResult(row.plusMinus)} | Skins: {formatSkinHoles(row.birdieHoles)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="min-h-9 rounded-full bg-canvas px-3 text-xs font-semibold text-ink"
                      onClick={() => editCompletedPlayer(row.playerId)}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl bg-canvas px-4 py-3 text-sm text-ink/60">No completed players yet.</p>
          )}
        </SectionCard>

        {allPlayersComplete ? (
          <button
            type="button"
            className="club-btn-primary min-h-14 w-full text-base disabled:opacity-60"
            disabled={isArchiving}
            onClick={handleFinalSubmit}
          >
            Submit All Scores
          </button>
        ) : null}
      </div>

      {playerConfirmRow ? (
        <div className="fixed inset-0 z-50 flex items-end bg-ink/45 px-3 pb-3 pt-6 sm:items-center sm:justify-center sm:p-4">
          <div className="w-full max-w-md rounded-[28px] bg-hero shadow-[0_24px_80px_rgba(26,38,59,0.22)]">
            <div className="space-y-4 px-4 pb-4 pt-5 sm:px-5 sm:pb-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Double-check this score</p>
                <h3 className="mt-1 text-xl font-semibold text-ink">{playerConfirmRow.playerName}</h3>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm text-ink/75">
                <p>Front 9: {playerConfirmRow.quickFrontNine ?? 0}</p>
                <p>Back 9: {playerConfirmRow.quickBackNine ?? 0}</p>
                <p>Total: {playerConfirmRow.totalPoints}</p>
                <p>Quota result: {formatQuotaResult(playerConfirmRow.plusMinus)}</p>
                <p className="col-span-2">Skin holes: {formatSkinHoles(playerConfirmRow.birdieHoles)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className="min-h-12 rounded-2xl border border-ink/10 bg-canvas px-4 text-sm font-semibold text-ink"
                  onClick={() => setPlayerConfirmId(null)}
                >
                  Go Back and Edit
                </button>
                <button type="button" className="club-btn-primary min-h-12 text-sm" onClick={confirmPlayerScore}>
                  Confirm Player Score
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isFinalConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-ink/45 px-3 pb-3 pt-6 sm:items-center sm:justify-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-hidden rounded-[28px] bg-hero shadow-[0_24px_80px_rgba(26,38,59,0.22)]">
            <div className="space-y-4 px-4 pb-4 pt-5 sm:px-5 sm:pb-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Finalize round?</p>
                <h3 className="mt-1 text-xl font-semibold text-ink">Review all player scores</h3>
              </div>
              <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
                {summaryRows.map((row) => (
                  <div key={`final-${row.playerId}`} className="rounded-[22px] bg-white/90 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-base font-semibold text-ink">{row.playerName}</p>
                      <p className="text-sm font-semibold text-ink">{row.totalPoints} pts</p>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-ink/70">
                      <p>Front 9: {row.quickFrontNine ?? 0}</p>
                      <p>Back 9: {row.quickBackNine ?? 0}</p>
                      <p>Result: {formatQuotaResult(row.plusMinus)}</p>
                      <p>Skins: {formatSkinHoles(row.birdieHoles)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className="min-h-12 rounded-2xl border border-ink/10 bg-canvas px-4 text-sm font-semibold text-ink"
                  onClick={() => setIsFinalConfirmOpen(false)}
                >
                  Go Back
                </button>
                <button type="button" className="club-btn-primary min-h-12 text-sm" onClick={confirmFinalRound}>
                  Confirm and Finish Round
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
