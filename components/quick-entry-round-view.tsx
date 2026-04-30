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

function getStatusClasses(tone: SaveState["tone"]) {
  if (tone === "failed") return "bg-[#FCE5E2] text-danger";
  if (tone === "saved") return "bg-[#EAF6EC] text-pine";
  if (tone === "saving") return "bg-[#FFF1BF] text-ink";
  return "bg-canvas text-ink/70";
}

function getChangeBadgeClasses(value: number) {
  if (value > 0) {
    return "bg-[#1B6B3A] text-white";
  }

  if (value < 0) {
    return "bg-[#B54545] text-white";
  }

  return "bg-canvas text-ink";
}

function getBirdieChoiceClasses(selected: boolean) {
  return selected
    ? "bg-ink text-white border-ink"
    : "bg-white text-ink/70 border-sand/70";
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
  allEntriesComplete,
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
  const [birdieSelectionOpen, setBirdieSelectionOpen] = useState<Record<string, boolean>>({});
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const lastSavedLabel = formatTimeLabel(lastSavedAt);
  const lastRefreshedLabel = formatTimeLabel(lastRefreshedAt);

  const summaryRows = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        birdieHoles: parseBirdieHolesInput(row.birdieHolesText)
      })),
    [rows]
  );

  useEffect(() => {
    setBirdieSelectionOpen((current) => {
      const next: Record<string, boolean> = {};

      for (const row of rows) {
        const hasBirdies = row.birdieHolesText.trim().length > 0;
        next[row.playerId] = hasBirdies ? true : current[row.playerId] ?? false;
      }

      return next;
    });
  }, [rows]);

  function handleBirdieChoice(playerId: string, enabled: boolean) {
    setBirdieSelectionOpen((current) => ({
      ...current,
      [playerId]: enabled
    }));

    if (!enabled) {
      onBirdieHolesChange(playerId, "");
    }
  }

  function toggleBirdieHole(playerId: string, currentText: string, holeNumber: number) {
    const currentHoles = parseBirdieHolesInput(currentText);
    const nextHoles = currentHoles.includes(holeNumber)
      ? currentHoles.filter((value) => value !== holeNumber)
      : [...currentHoles, holeNumber];

    onBirdieHolesChange(playerId, formatBirdieHolesInput(nextHoles));
  }

  function handleContinue() {
    if (!allEntriesComplete || isArchiving) {
      return;
    }

    setIsConfirmOpen(true);
  }

  function confirmScores() {
    setIsConfirmOpen(false);
    onArchiveRound();
  }

  return (
    <>
      <div className="space-y-3.5">
        <SectionCard className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Quick Entry Mode</p>
              <h3 className="mt-1 text-lg font-semibold text-ink">Enter clubhouse totals fast</h3>
              <p className="mt-1 text-sm text-ink/70">
                Add front nine points, back nine points, and any birdie holes for each player.
              </p>
            </div>
            <button
              type="button"
              className="club-btn-secondary min-h-10 px-4 text-sm"
              onClick={onRefresh}
            >
              Refresh
            </button>
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-medium text-ink/70">
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

        <div className="space-y-3">
          {summaryRows.map((row) => {
            const quotaChange = row.nextQuota - row.startQuota;
            const birdieSelectionEnabled = birdieSelectionOpen[row.playerId] ?? false;
            return (
              <SectionCard key={row.playerId} className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-ink">{row.playerName}</h3>
                      {row.team ? (
                        <span className="rounded-full bg-canvas px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/60">
                          Team {row.team}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-ink/70">Starting quota {row.startQuota}</p>
                  </div>
                  <div className="rounded-[20px] bg-canvas px-3 py-2.5 text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/45">Total</p>
                    <p className="mt-1 text-lg font-semibold text-ink">{row.totalPoints}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  <label className="space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/55">Front 9</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      className="h-12 w-full rounded-2xl border border-sand/70 bg-white px-3 text-base text-ink outline-none transition focus:border-pine/50"
                      value={row.quickFrontNine ?? ""}
                      onChange={(event) => onFrontNineChange(row.playerId, event.target.value)}
                      placeholder="0"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/55">Back 9</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      className="h-12 w-full rounded-2xl border border-sand/70 bg-white px-3 text-base text-ink outline-none transition focus:border-pine/50"
                      value={row.quickBackNine ?? ""}
                      onChange={(event) => onBackNineChange(row.playerId, event.target.value)}
                      placeholder="0"
                    />
                  </label>
                  <div className="rounded-2xl bg-white px-3 py-3 sm:block">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">Quota result</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-base font-semibold text-ink">{formatQuotaResult(row.plusMinus)}</p>
                      <span className={classNames("rounded-full px-2.5 py-1 text-xs font-semibold", getChangeBadgeClasses(quotaChange))}>
                        {quotaChange > 0 ? `+${quotaChange}` : `${quotaChange}`}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-[22px] bg-canvas/70 px-3.5 py-3.5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink">Did {row.playerName} have any birdies?</p>
                      <p className="mt-1 text-xs text-ink/60">Birdie holes are used to calculate good skins.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        className={classNames(
                          "min-h-11 rounded-2xl border px-4 text-sm font-semibold transition",
                          getBirdieChoiceClasses(!birdieSelectionEnabled)
                        )}
                        onClick={() => handleBirdieChoice(row.playerId, false)}
                      >
                        No
                      </button>
                      <button
                        type="button"
                        className={classNames(
                          "min-h-11 rounded-2xl border px-4 text-sm font-semibold transition",
                          getBirdieChoiceClasses(birdieSelectionEnabled)
                        )}
                        onClick={() => handleBirdieChoice(row.playerId, true)}
                      >
                        Yes
                      </button>
                    </div>
                  </div>

                  {birdieSelectionEnabled ? (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/55">Birdie holes</p>
                      <div className="grid grid-cols-6 gap-2">
                        {holeNumbers.map((holeNumber) => {
                          const selected = row.birdieHoles.includes(holeNumber);
                          return (
                            <button
                              key={`${row.playerId}-${holeNumber}`}
                              type="button"
                              className={classNames(
                                "min-h-11 rounded-2xl border text-sm font-semibold transition",
                                getBirdieHoleClasses(selected)
                              )}
                              onClick={() => toggleBirdieHole(row.playerId, row.birdieHolesText, holeNumber)}
                            >
                              {holeNumber}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </SectionCard>
            );
          })}
        </div>

        <SectionCard className="space-y-3">
          <p className="text-sm text-ink/70">
            Detailed hole-by-hole entry stays available in Detailed Entry mode. Quick Entry saves front and back totals, birdie holes, and the calculated quota results only.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className="club-btn-secondary min-h-12 text-sm"
              disabled={isArchiving}
              onClick={onSaveRound}
            >
              Save Progress
            </button>
            <button
              type="button"
              className="club-btn-primary min-h-12 text-sm disabled:opacity-60"
              disabled={isArchiving || !allEntriesComplete}
              onClick={handleContinue}
            >
              Continue
            </button>
          </div>
        </SectionCard>
      </div>

      {isConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-ink/45 px-3 pb-3 pt-6 sm:items-center sm:justify-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-hidden rounded-[28px] bg-hero shadow-[0_24px_80px_rgba(26,38,59,0.22)]">
            <div className="space-y-4 px-4 pb-4 pt-5 sm:px-5 sm:pb-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Double-check scores</p>
                <h3 className="mt-1 text-xl font-semibold text-ink">Review quick entry totals</h3>
                <p className="mt-2 text-sm text-ink/70">
                  Please confirm front 9 points, back 9 points, and birdie holes are correct before finishing.
                </p>
              </div>

              <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
                {summaryRows.map((row) => (
                  <div key={`confirm-${row.playerId}`} className="rounded-[22px] bg-white/90 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-base font-semibold text-ink">{row.playerName}</p>
                      <p className="text-sm font-semibold text-ink">{row.totalPoints} pts</p>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-ink/70">
                      <p>Front 9: {row.quickFrontNine ?? 0}</p>
                      <p>Back 9: {row.quickBackNine ?? 0}</p>
                      <p>Total: {row.totalPoints}</p>
                      <p>Birdies: {row.birdieHoles.length ? row.birdieHoles.join(", ") : "None"}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className="min-h-12 rounded-2xl border border-ink/10 bg-canvas px-4 text-sm font-semibold text-ink"
                  onClick={() => setIsConfirmOpen(false)}
                >
                  Go Back / Edit
                </button>
                <button
                  type="button"
                  className="club-btn-primary min-h-12 text-sm"
                  onClick={confirmScores}
                >
                  Confirm Scores
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
