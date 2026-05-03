"use client";

import { useEffect, useMemo, useState } from "react";
import { SectionCard } from "@/components/section-card";
import {
  formatGoodSkinEntriesInput,
  formatPlusMinus,
  goodSkinTypeLabels,
  holeNumbers,
  parseGoodSkinEntriesInput,
  type GoodSkinEntry,
  type GoodSkinType,
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
  groupNumber: number | null;
  teeTime: string | null;
  startQuota: number;
  quickFrontNine: number | null;
  quickBackNine: number | null;
  birdieHolesText: string;
  totalPoints: number;
  plusMinus: number;
  nextQuota: number;
};

type SummaryRow = QuickEntryRow & {
  goodSkinEntries: GoodSkinEntry[];
};

type EntryGroup = {
  key: string;
  label: string;
  groupNumber: number | null;
  teeTime: string | null;
  rows: SummaryRow[];
  completedCount: number;
  isComplete: boolean;
};

const goodSkinTypes: GoodSkinType[] = ["birdie", "eagle", "ace"];

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

function formatGoodSkins(entries: GoodSkinEntry[]) {
  return entries.length
    ? entries.map((entry) => `Hole ${entry.holeNumber} - ${goodSkinTypeLabels[entry.type]}`).join(", ")
    : "None";
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

function hasSavedScore(row: SummaryRow, isIndividualQuotaSkins: boolean) {
  return isIndividualQuotaSkins
    ? row.quickFrontNine != null
    : row.quickFrontNine != null && row.quickBackNine != null;
}

function getGroupKey(row: Pick<SummaryRow, "groupNumber">) {
  return row.groupNumber != null ? `group-${row.groupNumber}` : "group-unassigned";
}

function getSkinHoleClasses(selected: boolean, pending: boolean) {
  if (pending) return "border-[#1A263B] bg-ink text-white";
  if (selected) return "border-[#1B6B3A] bg-[#1B6B3A] text-white";
  return "border-sand/70 bg-white text-ink/70";
}

export function QuickEntryRoundView({
  rows,
  saveState,
  lastSavedAt,
  refreshState,
  lastRefreshedAt,
  isArchiving,
  isIndividualQuotaSkins = false,
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
  isIndividualQuotaSkins?: boolean;
  onFrontNineChange: (playerId: string, value: string) => void;
  onBackNineChange: (playerId: string, value: string) => void;
  onBirdieHolesChange: (playerId: string, value: string) => void;
  onSaveRound: () => void;
  onArchiveRound: () => void;
  onRefresh: () => void;
}) {
  const [completedPlayerIds, setCompletedPlayerIds] = useState<string[]>([]);
  const [editingPlayerIds, setEditingPlayerIds] = useState<string[]>([]);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [playerConfirmId, setPlayerConfirmId] = useState<string | null>(null);
  const [isFinalConfirmOpen, setIsFinalConfirmOpen] = useState(false);
  const [skinAnswerByPlayerId, setSkinAnswerByPlayerId] = useState<Record<string, boolean | null>>({});
  const [pendingSkinHoleByPlayerId, setPendingSkinHoleByPlayerId] = useState<Record<string, number | null>>({});

  const lastSavedLabel = formatTimeLabel(lastSavedAt);
  const lastRefreshedLabel = formatTimeLabel(lastRefreshedAt);

  const summaryRows = useMemo<SummaryRow[]>(
    () =>
      rows.map((row) => ({
        ...row,
        goodSkinEntries: parseGoodSkinEntriesInput(row.birdieHolesText)
      })),
    [rows]
  );

  const rowIds = useMemo(() => rows.map((row) => row.playerId), [rows]);
  const completedSet = useMemo(() => new Set(completedPlayerIds), [completedPlayerIds]);
  const editingSet = useMemo(() => new Set(editingPlayerIds), [editingPlayerIds]);
  const isPlayerComplete = (row: SummaryRow) =>
    !editingSet.has(row.playerId) && (completedSet.has(row.playerId) || hasSavedScore(row, isIndividualQuotaSkins));

  const entryGroups = useMemo<EntryGroup[]>(() => {
    const groups = new Map<string, Omit<EntryGroup, "completedCount" | "isComplete">>();

    for (const row of summaryRows) {
      const key = getGroupKey(row);
      const label = row.groupNumber != null ? `Group ${row.groupNumber}` : "Unassigned Group";
      const current = groups.get(key) ?? {
        key,
        label,
        groupNumber: row.groupNumber,
        teeTime: row.teeTime,
        rows: []
      };
      current.rows.push(row);
      groups.set(key, current);
    }

    return Array.from(groups.values())
      .map((group) => {
        const completedCount = group.rows.filter((row) => isPlayerComplete(row)).length;
        return {
          ...group,
          completedCount,
          isComplete: group.rows.length > 0 && completedCount === group.rows.length
        };
      })
      .sort((left, right) => {
        if (left.groupNumber == null && right.groupNumber != null) return 1;
        if (left.groupNumber != null && right.groupNumber == null) return -1;
        return (left.groupNumber ?? 999) - (right.groupNumber ?? 999);
      });
  }, [completedSet, editingSet, isIndividualQuotaSkins, summaryRows]);

  const selectedGroup = entryGroups.find((group) => group.key === selectedGroupKey) ?? null;
  const visibleRows = selectedGroup?.rows ?? [];
  const visibleRowIds = useMemo(() => visibleRows.map((row) => row.playerId), [visibleRows]);
  const completedRows = visibleRows.filter((row) => isPlayerComplete(row));
  const incompleteRows = visibleRows.filter((row) => !isPlayerComplete(row));
  const activeRow = selectedGroup
    ? visibleRows.find((row) => row.playerId === activePlayerId) ?? incompleteRows[0] ?? null
    : null;
  const activePlayerNumber = activeRow ? visibleRowIds.indexOf(activeRow.playerId) + 1 : visibleRows.length;
  const playerConfirmRow = summaryRows.find((row) => row.playerId === playerConfirmId) ?? null;
  const allPlayersComplete = summaryRows.length > 0 && summaryRows.every((row) => isPlayerComplete(row));
  const totalCompletedCount = summaryRows.filter((row) => isPlayerComplete(row)).length;

  useEffect(() => {
    setCompletedPlayerIds((current) => current.filter((playerId) => rowIds.includes(playerId)));
    setEditingPlayerIds((current) => current.filter((playerId) => rowIds.includes(playerId)));
    setSkinAnswerByPlayerId((current) => Object.fromEntries(Object.entries(current).filter(([playerId]) => rowIds.includes(playerId))));
    setPendingSkinHoleByPlayerId((current) => Object.fromEntries(Object.entries(current).filter(([playerId]) => rowIds.includes(playerId))));
  }, [rowIds]);

  useEffect(() => {
    if (selectedGroupKey && !entryGroups.some((group) => group.key === selectedGroupKey)) {
      setSelectedGroupKey(null);
    }
  }, [entryGroups, selectedGroupKey]);

  useEffect(() => {
    if (!selectedGroup || !visibleRows.length) {
      setActivePlayerId(null);
      return;
    }

    if (activePlayerId && visibleRowIds.includes(activePlayerId) && !isPlayerComplete(visibleRows.find((row) => row.playerId === activePlayerId)!)) {
      return;
    }

    setActivePlayerId(incompleteRows[0]?.playerId ?? null);
  }, [activePlayerId, incompleteRows, selectedGroup, visibleRowIds, visibleRows]);

  function getSkinAnswer(row: SummaryRow) {
    return skinAnswerByPlayerId[row.playerId] ?? (row.goodSkinEntries.length ? true : null);
  }

  function setSkinAnswer(row: SummaryRow, value: boolean) {
    setSkinAnswerByPlayerId((current) => ({
      ...current,
      [row.playerId]: value
    }));
    setPendingSkinHoleByPlayerId((current) => ({
      ...current,
      [row.playerId]: null
    }));
    if (!value) {
      onBirdieHolesChange(row.playerId, "");
    }
  }

  function selectSkinHole(row: SummaryRow, holeNumber: number) {
    setSkinAnswerByPlayerId((current) => ({
      ...current,
      [row.playerId]: true
    }));
    setPendingSkinHoleByPlayerId((current) => ({
      ...current,
      [row.playerId]: holeNumber
    }));
  }

  function saveSkinEntry(row: SummaryRow, type: GoodSkinType) {
    const holeNumber = pendingSkinHoleByPlayerId[row.playerId];
    if (!holeNumber) return;

    const nextEntries = [
      ...row.goodSkinEntries.filter((entry) => entry.holeNumber !== holeNumber),
      { holeNumber, type, score: type === "ace" ? 8 : type === "eagle" ? 6 : 4 }
    ];

    onBirdieHolesChange(row.playerId, formatGoodSkinEntriesInput(nextEntries));
    setPendingSkinHoleByPlayerId((current) => ({
      ...current,
      [row.playerId]: null
    }));
  }

  function removeSkinEntry(row: SummaryRow, holeNumber: number) {
    const nextEntries = row.goodSkinEntries.filter((entry) => entry.holeNumber !== holeNumber);
    onBirdieHolesChange(row.playerId, formatGoodSkinEntriesInput(nextEntries));
    setPendingSkinHoleByPlayerId((current) => ({
      ...current,
      [row.playerId]: null
    }));
  }

  function editCompletedPlayer(playerId: string) {
    const targetRow = summaryRows.find((row) => row.playerId === playerId);
    setCompletedPlayerIds((current) => current.filter((candidate) => candidate !== playerId));
    setEditingPlayerIds((current) => (current.includes(playerId) ? current : [...current, playerId]));
    setSelectedGroupKey(targetRow ? getGroupKey(targetRow) : selectedGroupKey);
    setActivePlayerId(playerId);
    setPlayerConfirmId(null);
    setIsFinalConfirmOpen(false);
  }

  function handleTotalPointsChange(playerId: string, value: string) {
    onFrontNineChange(playerId, value);
    onBackNineChange(playerId, "0");
  }

  function handleSavePlayerScore() {
    if (!activeRow || isArchiving) return;

    if (isIndividualQuotaSkins ? activeRow.quickFrontNine == null : activeRow.quickFrontNine == null || activeRow.quickBackNine == null) {
      return;
    }

    setPlayerConfirmId(activeRow.playerId);
  }

  function confirmPlayerScore() {
    if (!playerConfirmRow) return;

    const confirmedId = playerConfirmRow.playerId;
    const nextCompletedSet = new Set([...completedPlayerIds, confirmedId]);
    const nextEditingSet = new Set(editingPlayerIds.filter((playerId) => playerId !== confirmedId));
    const nextIsComplete = (row: SummaryRow) =>
      !nextEditingSet.has(row.playerId) && (nextCompletedSet.has(row.playerId) || hasSavedScore(row, isIndividualQuotaSkins));

    setCompletedPlayerIds((current) =>
      current.includes(confirmedId) ? current : [...current, confirmedId]
    );
    setEditingPlayerIds((current) => current.filter((playerId) => playerId !== confirmedId));
    setPlayerConfirmId(null);
    onSaveRound();

    const nextIncomplete = visibleRows.find(
      (row) => row.playerId !== confirmedId && !nextIsComplete(row)
    );
    setActivePlayerId(nextIncomplete?.playerId ?? null);
    if (!nextIncomplete) {
      setSelectedGroupKey(null);
    }
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
                {selectedGroup ? `Completed ${completedRows.length} of ${visibleRows.length} in ${selectedGroup.label}` : `Completed ${totalCompletedCount} of ${rows.length}`}
              </p>
            </div>
            <button type="button" className="club-btn-secondary min-h-10 px-4 text-sm" onClick={onRefresh}>
              Refresh Round
            </button>
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-medium text-ink/70">
            {activeRow ? <span>Player {activePlayerNumber} of {visibleRows.length}</span> : null}
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

        {!selectedGroup ? (
          <SectionCard className="space-y-3 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Score Entry</p>
              <h3 className="mt-1 text-xl font-semibold text-ink">Which group are you entering scores for?</h3>
            </div>
            {entryGroups.length ? (
              <div className="space-y-2.5">
                {entryGroups.map((group) => (
                  <button
                    key={group.key}
                    type="button"
                    className="w-full rounded-[22px] border border-sand/70 bg-white px-4 py-3 text-left transition hover:border-pine/40"
                    onClick={() => {
                      setSelectedGroupKey(group.key);
                      setActivePlayerId(group.rows.find((row) => !isPlayerComplete(row))?.playerId ?? group.rows[0]?.playerId ?? null);
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-ink">{group.label}</p>
                        <p className="mt-1 text-sm text-ink/65">{group.rows.map((row) => row.playerName).join(", ")}</p>
                      </div>
                      <span className={classNames("shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold", group.isComplete ? "bg-[#EAF6EC] text-pine" : "bg-canvas text-ink/70")}>
                        {group.isComplete ? "Completed" : `${group.completedCount}/${group.rows.length}`}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl bg-canvas px-4 py-3 text-sm text-ink/60">No groups are available for score entry.</p>
            )}
          </SectionCard>
        ) : activeRow ? (
          <SectionCard className="space-y-4 p-4">
            <button type="button" className="w-fit rounded-full bg-canvas px-3 py-2 text-xs font-semibold text-ink" onClick={() => setSelectedGroupKey(null)}>
              Back to groups
            </button>
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

            {isIndividualQuotaSkins ? (
              <label className="space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/55">Total quota points</span>
                <input
                  type="number"
                  inputMode="numeric"
                  className="h-14 w-full rounded-2xl border border-sand/70 bg-white px-3 text-lg text-ink outline-none transition focus:border-pine/50"
                  value={activeRow.quickFrontNine ?? ""}
                  onChange={(event) => handleTotalPointsChange(activeRow.playerId, event.target.value)}
                  placeholder="0"
                />
              </label>
            ) : (
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
            )}

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

            <div className="space-y-3 rounded-[22px] bg-canvas/70 px-3.5 py-3.5">
              <p className="text-sm font-semibold text-ink">Did this player have any skins?</p>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  className={classNames("min-h-12 rounded-2xl border px-4 text-sm font-semibold", getSkinAnswer(activeRow) === false ? "border-[#1B6B3A] bg-[#1B6B3A] text-white" : "border-sand/70 bg-white text-ink")}
                  onClick={() => setSkinAnswer(activeRow, false)}
                >
                  No
                </button>
                <button
                  type="button"
                  className={classNames("min-h-12 rounded-2xl border px-4 text-sm font-semibold", getSkinAnswer(activeRow) === true ? "border-[#1B6B3A] bg-[#1B6B3A] text-white" : "border-sand/70 bg-white text-ink")}
                  onClick={() => setSkinAnswer(activeRow, true)}
                >
                  Yes
                </button>
              </div>

              {getSkinAnswer(activeRow) === true ? (
                <div className="space-y-3">
                  {activeRow.goodSkinEntries.length ? (
                    <div className="space-y-2">
                      {activeRow.goodSkinEntries.map((entry) => (
                        <div key={`${activeRow.playerId}-skin-${entry.holeNumber}`} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2.5 text-sm">
                          <span className="font-semibold text-ink">Hole {entry.holeNumber} - {goodSkinTypeLabels[entry.type]}</span>
                          <button type="button" className="rounded-full bg-canvas px-3 py-1 text-xs font-semibold text-ink" onClick={() => removeSkinEntry(activeRow, entry.holeNumber)}>
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="grid grid-cols-6 gap-2">
                    {holeNumbers.map((holeNumber) => {
                      const selected = activeRow.goodSkinEntries.some((entry) => entry.holeNumber === holeNumber);
                      const pending = pendingSkinHoleByPlayerId[activeRow.playerId] === holeNumber;
                      return (
                        <button
                          key={`${activeRow.playerId}-${holeNumber}`}
                          type="button"
                          className={classNames("min-h-11 rounded-2xl border text-sm font-semibold transition", getSkinHoleClasses(selected, pending))}
                          onClick={() => selectSkinHole(activeRow, holeNumber)}
                        >
                          {holeNumber}
                        </button>
                      );
                    })}
                  </div>

                  {pendingSkinHoleByPlayerId[activeRow.playerId] ? (
                    <div className="space-y-2 rounded-2xl bg-white px-3 py-3">
                      <p className="text-sm font-semibold text-ink">What was it?</p>
                      <div className="grid grid-cols-3 gap-2">
                        {goodSkinTypes.map((type) => (
                          <button
                            key={`${activeRow.playerId}-${type}`}
                            type="button"
                            className="min-h-11 rounded-2xl bg-canvas px-2 text-xs font-semibold text-ink"
                            onClick={() => saveSkinEntry(activeRow, type)}
                          >
                            {goodSkinTypeLabels[type]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className="club-btn-primary min-h-14 w-full text-base disabled:opacity-60"
              disabled={isArchiving || (isIndividualQuotaSkins ? activeRow.quickFrontNine == null : activeRow.quickFrontNine == null || activeRow.quickBackNine == null)}
              onClick={handleSavePlayerScore}
            >
              Save Player Score
            </button>
          </SectionCard>
        ) : (
          <SectionCard className="space-y-3 border border-pine/20 bg-[#E2F4E6]">
            <button type="button" className="w-fit rounded-full bg-white px-3 py-2 text-xs font-semibold text-ink" onClick={() => setSelectedGroupKey(null)}>
              Back to groups
            </button>
            <h3 className="text-lg font-semibold text-ink">All players completed</h3>
            <p className="text-sm text-ink/70">Review the completed list, then submit all scores.</p>
          </SectionCard>
        )}

        {selectedGroup ? (
          <SectionCard className="space-y-3">
            <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-ink">Completed Players</h3>
            <span className="text-sm font-semibold text-ink/60">{completedRows.length}/{visibleRows.length}</span>
            </div>
            {completedRows.length ? (
            <div className="space-y-2">
              {completedRows.map((row) => (
                <div key={`completed-${row.playerId}`} className="rounded-2xl bg-white px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{row.playerName}</p>
                      <p className="mt-1 text-xs text-ink/60">
                        {row.totalPoints} pts | {formatQuotaResult(row.plusMinus)} | {formatGoodSkins(row.goodSkinEntries)}
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
        ) : null}

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
                {isIndividualQuotaSkins ? null : <p>Front 9: {playerConfirmRow.quickFrontNine ?? 0}</p>}
                {isIndividualQuotaSkins ? null : <p>Back 9: {playerConfirmRow.quickBackNine ?? 0}</p>}
                <p>Total: {playerConfirmRow.totalPoints}</p>
                <p>Quota result: {formatQuotaResult(playerConfirmRow.plusMinus)}</p>
                <p className="col-span-2">Good skins: {formatGoodSkins(playerConfirmRow.goodSkinEntries)}</p>
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
                      {isIndividualQuotaSkins ? null : <p>Front 9: {row.quickFrontNine ?? 0}</p>}
                      {isIndividualQuotaSkins ? null : <p>Back 9: {row.quickBackNine ?? 0}</p>}
                      <p>Result: {formatQuotaResult(row.plusMinus)}</p>
                      <p>Good skins: {formatGoodSkins(row.goodSkinEntries)}</p>
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
