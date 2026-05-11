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
  const [completedPlayerIds, setCompletedPlayerIds] = useState<string[]>(() =>
    rows.filter((row) => hasSavedScore({ ...row, goodSkinEntries: [] }, isIndividualQuotaSkins)).map((row) => row.playerId)
  );
  const [editingPlayerIds, setEditingPlayerIds] = useState<string[]>([]);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [playerConfirmId, setPlayerConfirmId] = useState<string | null>(null);
  const [isFinalConfirmOpen, setIsFinalConfirmOpen] = useState(false);
  const [hasFinalSubmitStarted, setHasFinalSubmitStarted] = useState(false);
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
    !editingSet.has(row.playerId) && completedSet.has(row.playerId);

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

  function handleSavePlayerScore(row: SummaryRow) {
    if (isArchiving) return;

    const valuesToValidate = isIndividualQuotaSkins
      ? [row.quickFrontNine]
      : [row.quickFrontNine, row.quickBackNine];

    if (valuesToValidate.some((value) => value == null || value < 0 || !Number.isInteger(value))) {
      return;
    }

    setActivePlayerId(row.playerId);
    setPlayerConfirmId(row.playerId);
  }

  function confirmPlayerScore() {
    if (!playerConfirmRow) return;

    const confirmedId = playerConfirmRow.playerId;
    const nextCompletedSet = new Set([...completedPlayerIds, confirmedId]);
    const nextEditingSet = new Set(editingPlayerIds.filter((playerId) => playerId !== confirmedId));
    const nextIsComplete = (row: SummaryRow) =>
      !nextEditingSet.has(row.playerId) && nextCompletedSet.has(row.playerId);

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
    if (!allPlayersComplete || isArchiving || hasFinalSubmitStarted) return;
    setIsFinalConfirmOpen(true);
  }

  function confirmFinalRound() {
    if (isArchiving || hasFinalSubmitStarted) return;
    setHasFinalSubmitStarted(true);
    onArchiveRound();
  }

  return (
    <>
      <div className="space-y-3.5">
        <SectionCard className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Scorecard Entry</p>
              <h3 className="mt-1 text-lg font-semibold text-ink">Enter the group score sheet</h3>
              <p className="mt-1 text-sm text-ink/70">
                {selectedGroup ? `Completed ${completedRows.length} of ${visibleRows.length} in ${selectedGroup.label}` : `Completed ${totalCompletedCount} of ${rows.length}`}
              </p>
            </div>
            <button type="button" className="club-btn-secondary min-h-10 px-4 text-sm" onClick={onRefresh}>
              Refresh Round
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
        ) : selectedGroup ? (
          <SectionCard className="space-y-3 p-3">
            <div className="flex items-center justify-between gap-3">
              <button type="button" className="w-fit rounded-full bg-canvas px-3 py-2 text-xs font-semibold text-ink" onClick={() => setSelectedGroupKey(null)}>
                Back to groups
              </button>
              <span className="text-xs font-semibold text-ink/60">{selectedGroup.label}</span>
            </div>

            <div className="space-y-2">
              {visibleRows.map((row) => {
                const completed = isPlayerComplete(row);
                const missingScore = isIndividualQuotaSkins ? row.quickFrontNine == null : row.quickFrontNine == null || row.quickBackNine == null;
                const skinAnswer = getSkinAnswer(row);

                return (
                  <div
                    key={`entry-${row.playerId}`}
                    className={classNames(
                      "rounded-[18px] border px-3 py-2.5",
                      completed ? "border-[#5A9764]/25 bg-[#EAF6EC]" : "border-sand/70 bg-white"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold text-ink">{row.playerName}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/55">
                          <span className="rounded-full bg-canvas px-2 py-0.5">Q{row.startQuota}</span>
                          {row.team ? <span className="rounded-full bg-canvas px-2 py-0.5">Team {row.team}</span> : null}
                          {completed ? <span className="rounded-full bg-[#1B6B3A] px-2 py-0.5 text-white">Done</span> : null}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-xs font-semibold text-ink/65">
                        <p>{row.totalPoints} pts</p>
                        {row.quickFrontNine != null || row.quickBackNine != null ? <p>{formatQuotaResult(row.plusMinus)}</p> : null}
                      </div>
                    </div>

                    {isIndividualQuotaSkins ? (
                      <label className="mt-2 grid grid-cols-[1fr_5rem] items-center gap-2">
                        <span className="text-xs font-semibold text-ink/60">Total quota points</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          disabled={completed}
                          className="h-11 w-full min-w-0 rounded-xl border border-sand/70 bg-white px-2 text-base font-semibold text-ink outline-none transition focus:border-pine/50 disabled:bg-canvas disabled:text-ink/60"
                          value={row.quickFrontNine ?? ""}
                          onChange={(event) => handleTotalPointsChange(row.playerId, event.target.value)}
                          placeholder="0"
                        />
                      </label>
                    ) : (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="min-w-0">
                          <span className="block text-xs font-semibold text-ink/60">Front</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={1}
                            disabled={completed}
                            className="h-11 w-full min-w-0 rounded-xl border border-sand/70 bg-white px-2 text-base font-semibold text-ink outline-none transition focus:border-pine/50 disabled:bg-canvas disabled:text-ink/60"
                            value={row.quickFrontNine ?? ""}
                            onChange={(event) => onFrontNineChange(row.playerId, event.target.value)}
                            placeholder="0"
                          />
                        </label>
                        <label className="min-w-0">
                          <span className="block text-xs font-semibold text-ink/60">Back</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={1}
                            disabled={completed}
                            className="h-11 w-full min-w-0 rounded-xl border border-sand/70 bg-white px-2 text-base font-semibold text-ink outline-none transition focus:border-pine/50 disabled:bg-canvas disabled:text-ink/60"
                            value={row.quickBackNine ?? ""}
                            onChange={(event) => onBackNineChange(row.playerId, event.target.value)}
                            placeholder="0"
                          />
                        </label>
                      </div>
                    )}

                    <div className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-2">
                      <span className="text-xs font-semibold text-ink/65">Skins?</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          disabled={completed}
                          className={classNames("min-h-9 rounded-xl border px-3 text-xs font-semibold disabled:opacity-60", skinAnswer === false ? "border-[#1B6B3A] bg-[#1B6B3A] text-white" : "border-sand/70 bg-canvas text-ink")}
                          onClick={() => setSkinAnswer(row, false)}
                        >
                          No
                        </button>
                        <button
                          type="button"
                          disabled={completed}
                          className={classNames("min-h-9 rounded-xl border px-3 text-xs font-semibold disabled:opacity-60", skinAnswer === true ? "border-[#1B6B3A] bg-[#1B6B3A] text-white" : "border-sand/70 bg-canvas text-ink")}
                          onClick={() => setSkinAnswer(row, true)}
                        >
                          Yes
                        </button>
                      </div>
                      {completed ? (
                        <button type="button" className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink" onClick={() => editCompletedPlayer(row.playerId)}>
                          Edit
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="rounded-full bg-pine px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                          disabled={isArchiving || missingScore}
                          onClick={() => handleSavePlayerScore(row)}
                        >
                          Save
                        </button>
                      )}
                    </div>

                    {row.goodSkinEntries.length ? (
                      <p className="mt-2 truncate text-xs font-semibold text-ink/65">{formatGoodSkins(row.goodSkinEntries)}</p>
                    ) : null}

                    {skinAnswer === true && !completed ? (
                      <div className="mt-2 space-y-2 rounded-2xl bg-canvas/70 px-2 py-2">
                        <div className="grid grid-cols-9 gap-1.5">
                          {holeNumbers.map((holeNumber) => {
                            const selected = row.goodSkinEntries.some((entry) => entry.holeNumber === holeNumber);
                            const pending = pendingSkinHoleByPlayerId[row.playerId] === holeNumber;
                            return (
                              <button
                                key={`${row.playerId}-${holeNumber}`}
                                type="button"
                                className={classNames("min-h-9 rounded-xl border text-xs font-semibold transition", getSkinHoleClasses(selected, pending))}
                                onClick={() => selectSkinHole(row, holeNumber)}
                              >
                                {holeNumber}
                              </button>
                            );
                          })}
                        </div>

                        {pendingSkinHoleByPlayerId[row.playerId] ? (
                          <div className="grid grid-cols-3 gap-1.5">
                            {goodSkinTypes.map((type) => (
                              <button
                                key={`${row.playerId}-${type}`}
                                type="button"
                                className="min-h-10 rounded-xl bg-white px-2 text-[11px] font-semibold text-ink"
                                onClick={() => saveSkinEntry(row, type)}
                              >
                                {goodSkinTypeLabels[type]}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
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
        {allPlayersComplete ? (
          <button
            type="button"
            className="club-btn-primary min-h-14 w-full text-base disabled:opacity-60"
            disabled={isArchiving || hasFinalSubmitStarted}
            onClick={handleFinalSubmit}
          >
            Finalize Round
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
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">FINALIZE ROUND</p>
                <h3 className="mt-1 text-xl font-semibold text-ink">Please double-check all scores</h3>
                <div className="mt-3 rounded-[22px] border border-danger/15 bg-white/90 px-4 py-3 text-sm text-ink/75">
                  <p className="font-semibold text-ink">This will:</p>
                  <ul className="mt-2 space-y-1">
                    <li>• Calculate final results</li>
                    <li>• Calculate payouts</li>
                    <li>• Update player quotas</li>
                    <li>• Save the round to Past Games</li>
                  </ul>
                  <p className="mt-3 font-semibold text-danger">Please double-check all scores and skins before finalizing.</p>
                </div>
              </div>
              <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
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
                  disabled={isArchiving || hasFinalSubmitStarted}
                  onClick={() => setIsFinalConfirmOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="club-btn-primary min-h-12 text-sm disabled:opacity-60"
                  disabled={isArchiving || hasFinalSubmitStarted}
                  onClick={confirmFinalRound}
                >
                  {isArchiving || hasFinalSubmitStarted ? "Finalizing..." : "Yes, Finalize Round"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
