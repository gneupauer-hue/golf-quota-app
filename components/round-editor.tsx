"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { MatchRoundView, SkinsOnlyRoundView } from "@/components/active-round-view";
import { QuickEntryRoundView } from "@/components/quick-entry-round-view";
import { PageTitle } from "@/components/page-title";
import { RoundUtilityActions } from "@/components/round-utility-actions";
import { ScoreButtonGroup } from "@/components/score-button-group";
import { SectionCard } from "@/components/section-card";
import {
  calculateLiveLeaders,
  calculateLiveProjections,
  calculatePayoutPredictions,
  calculateRoundRows,
  calculateSideGameResults,
  calculateTeamStandings,
  formatBirdieHolesInput,
  formatGoodSkinEntriesInput,
  formatPlusMinus,
  getRankTone,
  hasSequentialHoleEntry,
  holeNumbers,
  parseBirdieHolesInput,
  parseGoodSkinEntriesInput,
  teamOptions,
  type CalculatedRoundRow,
  type PlayerBuyInSummary,
  type RoundMode,
  type ScoringEntryMode,
  type SideGameResults,
  type TeamCode,
  type TeamStanding
} from "@/lib/quota";
import {
  buildBalancedTeams,
  capacitiesToMap,
  getTeamFormatKey,
  getTeamFormats
} from "@/lib/round-setup";
import { classNames, formatDateInput, formatRoundNameFromDate, getPreferredRoundName } from "@/lib/utils";

type PlayerOption = {
  id: string;
  name: string;
  quota: number;
  isRegular: boolean;
  isActive: boolean;
  conflictIds: string[];
};

type EditorEntry = {
  id: string;
  playerId: string;
  playerName: string;
  team: TeamCode | null;
  groupNumber: number | null;
  teeTime: string | null;
  holeScores: Array<number | null>;
  scoringEntryMode: ScoringEntryMode;
  quickFrontNine: number | null;
  quickBackNine: number | null;
  birdieHoles: number[];
  frontSubmittedAt: string | null;
  backSubmittedAt: string | null;
  frontNine: number;
  backNine: number;
  totalPoints: number;
  startQuota: number;
  plusMinus: number;
  nextQuota: number;
  rank: number;
};

type EditorProps = {
  round: {
    id: string;
    roundName: string;
    roundDate: string;
    roundMode: RoundMode;
    scoringEntryMode: ScoringEntryMode;
    isTestRound: boolean;
    buyInPaidPlayerIds: string[];
    notes: string;
    teamCount: number | null;
    lockedAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    entries: EditorEntry[];
  };
  players: PlayerOption[];
  quotaSnapshot: Record<string, number>;
  groups: Array<{
    groupNumber: number;
    teeTime: string;
    players: string[];
  }>;
};

type RowState = {
  playerId: string;
  team: TeamCode | null;
  groupNumber: number | null;
  teeTime: string | null;
  holeScores: Array<number | null>;
  quickFrontNine: number | null;
  quickBackNine: number | null;
  birdieHolesText: string;
  frontSubmittedAt: string | null;
  backSubmittedAt: string | null;
};

type SaveState = {
  tone: "idle" | "saving" | "saved" | "failed";
  message: string;
};

type QuotaAdjustmentPreviewRow = {
  playerId: string;
  playerName: string;
  startQuota: number;
  totalPoints: number;
  quotaAdjustment: number;
  nextQuota: number;
};

type QuotaValidationIssue = {
  playerId: string;
  playerName: string;
  roundId: string | null;
  roundLabel: string;
  fieldLabel: string;
  expected: string;
  actual: string;
  expectedQuota: number | null;
  actualQuota: number | null;
};

type QuotaValidationSummary = {
  totalPlayersChecked: number;
  totalRoundsChecked: number;
  mismatchCount: number;
  issues: QuotaValidationIssue[];
};

type QuotaAdjustmentPreview = {
  warning: string;
  isTestRound: boolean;
  readOnly: boolean;
  approvedAt: string | null;
  rows: QuotaAdjustmentPreviewRow[];
  validation: QuotaValidationSummary;
};

type LockedScoreAction =
  | { type: "select-hole"; team: TeamCode; hole: number }
  | { type: "update-score"; playerId: string; holeIndex: number; value: number | null };

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2
  }).format(value);
}

function formatPlace(place: number) {
  if (place === 1) return "1st";
  if (place === 2) return "2nd";
  if (place === 3) return "3rd";
  return `${place}th`;
}

function TestRoundBadge({ subtle = false }: { subtle?: boolean }) {
  return (
    <div
      className={classNames(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em]",
        subtle ? "bg-[#FFF1BF] text-ink" : "bg-[#FCE0D2] text-[#A53B2A]"
      )}
    >
      <span className="inline-block h-2 w-2 rounded-full bg-current" />
      Test Round
    </div>
  );
}

function teamLeaderValue(team: TeamStanding, section: "front" | "back" | "total") {
  if (section === "front") return team.frontPlusMinus;
  if (section === "back") return team.backPlusMinus;
  return team.totalPlusMinus;
}

function getSuggestedHole(rows: Array<CalculatedRoundRow>) {
  if (!rows.length) return 1;

  for (let holeIndex = 0; holeIndex < holeNumbers.length; holeIndex += 1) {
    if (!rows.every((row) => row.holeScores[holeIndex] != null)) {
      return holeIndex + 1;
    }
  }

  return 18;
}

function getTeamProgress(rows: Array<CalculatedRoundRow>) {
  if (!rows.length) return 0;

  for (let holeIndex = 0; holeIndex < holeNumbers.length; holeIndex += 1) {
    if (!rows.every((row) => row.holeScores[holeIndex] != null)) {
      return holeIndex;
    }
  }

  return 18;
}

function hasRecordedFinalHole(holeScores: Array<number | null>) {
  return holeScores[17] != null;
}

function hasSubmittedFrontNine(row: Pick<RowState, "frontSubmittedAt">) {
  return Boolean(row.frontSubmittedAt);
}

function hasSubmittedBackNine(row: Pick<RowState, "backSubmittedAt">) {
  return Boolean(row.backSubmittedAt);
}

function hasCompletedSegment(holeScores: Array<number | null>, startIndex: number, endIndex: number) {
  return holeScores.slice(startIndex, endIndex).every((score) => score != null);
}

function getSuggestedHoleFromScores(holeScores: Array<number | null>) {
  for (let holeIndex = 0; holeIndex < holeNumbers.length; holeIndex += 1) {
    if (holeScores[holeIndex] == null) {
      return holeIndex + 1;
    }
  }

  return 18;
}

function getCheckpointAwareTeamHole(
  teamRows: Array<Pick<RowState, "holeScores" | "frontSubmittedAt" | "backSubmittedAt">>
) {
  if (!teamRows.length) {
    return 1;
  }

  const frontComplete = teamRows.every((row) => hasCompletedSegment(row.holeScores, 0, 9));
  const frontSubmitted = teamRows.every((row) => Boolean(row.frontSubmittedAt));
  const backComplete = teamRows.every((row) => hasCompletedSegment(row.holeScores, 9, 18));
  const backSubmitted = teamRows.every((row) => Boolean(row.backSubmittedAt));

  if (frontComplete && !frontSubmitted) {
    return 9;
  }

  if (backComplete && !backSubmitted) {
    return 18;
  }

  const suggestedHole = Math.max(
    ...teamRows.map((row) => getSuggestedHoleFromScores(row.holeScores))
  );

  return Math.max(1, Math.min(18, suggestedHole));
}

function formatTimeLabel(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function getSaveToneClass(tone: SaveState["tone"]) {
  if (tone === "failed") return "bg-[#FCE5E2] text-danger";
  if (tone === "saved") return "bg-[#E2F4E6] text-pine";
  if (tone === "saving") return "bg-[#FFF1BF] text-ink";
  return "bg-canvas text-ink/70";
}

function isTeamFinished(rows: Array<CalculatedRoundRow>) {
  return rows.length > 0 && rows.every((row) => hasRecordedFinalHole(row.holeScores));
}

function mapEditorEntriesToRows(entries: EditorEntry[]): RowState[] {
  return entries.map((entry) => ({
    playerId: entry.playerId,
    team: entry.team,
    groupNumber: entry.groupNumber,
    teeTime: entry.teeTime,
    quickFrontNine: entry.quickFrontNine ?? null,
    quickBackNine: entry.quickBackNine ?? null,
    birdieHolesText: formatBirdieHolesInput(entry.birdieHoles),
    frontSubmittedAt: entry.frontSubmittedAt,
    backSubmittedAt: entry.backSubmittedAt,
    holeScores:
      entry.holeScores.length === 18
        ? entry.holeScores
        : Array.from({ length: 18 }, () => null)
  }));
}

function isHoleLockedForRow(row: Pick<RowState, "frontSubmittedAt" | "backSubmittedAt">, holeIndex: number) {
  if (row.backSubmittedAt) {
    return true;
  }

  return holeIndex < 9 && Boolean(row.frontSubmittedAt);
}

function formatGoalProgress(value: number) {
  return value === 0 ? "E" : formatPlusMinus(value);
}

function getSetupTeamLabel(team: TeamCode) {
  const index = teamOptions.indexOf(team);
  return `Team ${index >= 0 ? index + 1 : team}`;
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

function getNeutralStatusChipClasses() {
  return "bg-canvas text-ink/70";
}

function getPaceSummaryPillClasses(value: number) {
  if (value < -0.05) {
    return "bg-[#FCE5E2] text-danger";
  }
  if (value > 0.05) {
    return "bg-[#E2F4E6] text-pine";
  }
  return "bg-canvas text-ink";
}

function formatPaceProgress(delta: number) {
  if (Math.abs(delta) < 0.05) {
    return "E";
  }

  const rounded = Math.round(delta * 10) / 10;
  const formatted = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return rounded > 0 ? `+${formatted}` : formatted;
}

function buildPaceStatus({
  label,
  actualPoints,
  goal,
  holesCompleted,
  segmentHoleCount,
  started
}: {
  label: string;
  actualPoints: number;
  goal: number;
  holesCompleted: number;
  segmentHoleCount: number;
  started: boolean;
}) {
  if (!started) {
    return {
      label,
      progress: `${actualPoints} of ${goal}`,
      toneClass: getNeutralStatusChipClasses()
    };
  }

  const expectedSoFar = goal * (holesCompleted / segmentHoleCount);
  const paceDelta = actualPoints - expectedSoFar;

  return {
    label,
    progress: `${actualPoints} of ${goal}`,
    toneClass: getGoalStatusChipClasses(paceDelta)
  };
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
      continue;
    }

    break;
  }

  return completed;
}

function countCompletedPlayerHoles(holeScores: Array<number | null>) {
  let completed = 0;

  for (const score of holeScores) {
    if (score == null) {
      break;
    }
    completed += 1;
  }

  return completed;
}

function getPlayerQuotaProgressTone(
  totalPoints: number,
  quota: number,
  holesCompleted: number,
  tolerance = 0.5
) {
  if (holesCompleted === 0) {
    return "text-ink/60";
  }

  const expectedPoints = (quota / 18) * holesCompleted;
  const delta = totalPoints - expectedPoints;

  if (delta > tolerance) {
    return "text-pine";
  }

  if (delta < -tolerance) {
    return "text-danger";
  }

  return "text-ink/70";
}

function ProgressStatusChip({
  label,
  progress,
  toneClass,
  saveSignal
}: {
  label: string;
  progress: string;
  toneClass: string;
  saveSignal: string | null;
}) {
  const [showUpdateCue, setShowUpdateCue] = useState(false);
  const previousProgress = useRef(progress);
  const lastHandledSaveSignal = useRef<string | null>(null);

  useEffect(() => {
    if (!saveSignal || lastHandledSaveSignal.current === saveSignal) {
      return;
    }

    if (previousProgress.current !== progress) {
      previousProgress.current = progress;
      lastHandledSaveSignal.current = saveSignal;
      setShowUpdateCue(true);
      const timeout = window.setTimeout(() => setShowUpdateCue(false), 800);
      return () => window.clearTimeout(timeout);
    }

    previousProgress.current = progress;
    lastHandledSaveSignal.current = saveSignal;
  }, [progress, saveSignal]);

  return (
    <div
      className={classNames(
        "flex min-w-0 flex-col items-center justify-center rounded-2xl px-2 py-1.5 text-center transition-all duration-500",
        toneClass,
        showUpdateCue ? "ring-2 ring-white/70 brightness-[1.04]" : ""
      )}
    >
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] opacity-70">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold">{progress}</p>
    </div>
  );
}

function sortTeamsAlphabetically<T extends { team: TeamCode }>(teams: T[]) {
  return [...teams].sort((left, right) => left.team.localeCompare(right.team));
}

function rotateItems<T>(items: T[], offset: number) {
  if (items.length <= 1) {
    return items;
  }

  const normalizedOffset = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(normalizedOffset), ...items.slice(0, normalizedOffset)];
}

type ScoringGroup = {
  key: string;
  label: string;
  groupNumber: number | null;
  teeTime: string | null;
  teams: TeamCode[];
  playerNames: string[];
};

function buildScoringGroups(
  rows: RowState[],
  teamStandings: TeamStanding[],
  playerNamesById: Map<string, string>,
  initialGroups: EditorProps["groups"],
  options: { ignoreExistingGroups?: boolean; variant?: number } = {}
) {
  const baseTeams = sortTeamsAlphabetically(teamStandings);
  const variant = options.variant ?? 0;
  const orderedTeams = options.ignoreExistingGroups && baseTeams.length > 1
    ? rotateItems(variant % 2 === 0 ? baseTeams : [...baseTeams].reverse(), variant)
    : baseTeams;

  if (!orderedTeams.length) {
    return [] as ScoringGroup[];
  }

  const explicitGroups = new Map<string, ScoringGroup>();
  const hasExplicitGroups = !options.ignoreExistingGroups && orderedTeams.some((team) =>
    rows.some((row) => row.team === team.team && row.groupNumber != null)
  );

  if (hasExplicitGroups) {
    for (const team of orderedTeams) {
      const teamRows = rows.filter((row) => row.team === team.team);
      const groupedRow = teamRows.find((row) => row.groupNumber != null) ?? teamRows[0] ?? null;
      const groupNumber = groupedRow?.groupNumber ?? null;
      const teeTime = groupedRow?.teeTime ?? null;
      const key = groupNumber != null ? `group-${groupNumber}` : `team-${team.team}`;
      const label = groupNumber != null ? `Group ${groupNumber}` : `Team ${team.team}`;
      const current = explicitGroups.get(key) ?? {
        key,
        label: teeTime ? `${label} - ${teeTime}` : label,
        groupNumber,
        teeTime,
        teams: [],
        playerNames: []
      };
      current.teams.push(team.team);
      current.playerNames.push(...team.players);
      explicitGroups.set(key, current);
    }

    return Array.from(explicitGroups.values());
  }

  if (!options.ignoreExistingGroups && initialGroups.length > 0) {
    const groupsFromSetup = initialGroups
      .map((group) => {
        const groupTeamSet = new Set<TeamCode>();

        for (const playerName of group.players) {
          const matchedRow = rows.find(
            (row) => playerNamesById.get(row.playerId) === playerName && row.team != null
          );

          if (matchedRow?.team) {
            groupTeamSet.add(matchedRow.team);
          }
        }

        return {
          key: `initial-group-${group.groupNumber}`,
          label: group.teeTime ? `Group ${group.groupNumber} - ${group.teeTime}` : `Group ${group.groupNumber}`,
          groupNumber: group.groupNumber,
          teeTime: group.teeTime,
          teams: Array.from(groupTeamSet),
          playerNames: [...group.players]
        } satisfies ScoringGroup;
      })
      .filter((group) => group.teams.length > 0);

    if (groupsFromSetup.length > 0) {
      return groupsFromSetup;
    }
  }

  const derivedGroups: ScoringGroup[] = [];
  let groupIndex = 1;
  let currentTeams: TeamCode[] = [];
  let currentPlayers: string[] = [];
  let currentPlayerCount = 0;

  for (const team of orderedTeams) {
    const teamPlayerCount = team.players.length;
    if (currentTeams.length > 0 && currentPlayerCount + teamPlayerCount > 4) {
      derivedGroups.push({
        key: `derived-${groupIndex}`,
        label: `Group ${groupIndex}`,
        groupNumber: groupIndex,
        teeTime: null,
        teams: currentTeams,
        playerNames: currentPlayers
      });
      groupIndex += 1;
      currentTeams = [];
      currentPlayers = [];
      currentPlayerCount = 0;
    }

    currentTeams.push(team.team);
    currentPlayers.push(...team.players);
    currentPlayerCount += teamPlayerCount;
  }

  if (currentTeams.length > 0) {
    derivedGroups.push({
      key: `derived-${groupIndex}`,
      label: `Group ${groupIndex}`,
      groupNumber: groupIndex,
      teeTime: null,
      teams: currentTeams,
      playerNames: currentPlayers
    });
  }

  return derivedGroups;
}


type IndividualScoringGroup = {
  key: string;
  label: string;
  groupNumber: number;
  playerIds: string[];
  playerNames: string[];
};

function normalizeIndividualGroupOrder(groups: IndividualScoringGroup[]) {
  return [...groups]
    .sort((left, right) => {
      if (left.playerIds.length !== right.playerIds.length) {
        return left.playerIds.length - right.playerIds.length;
      }
      return left.groupNumber - right.groupNumber;
    })
    .map((group, index) => ({
      ...group,
      key: `individual-group-${index + 1}`,
      label: `Group ${index + 1}`,
      groupNumber: index + 1
    }));
}
function buildIndividualScoringGroups(
  rows: RowState[],
  playersById: Map<string, EditorProps["players"][number]>,
  quotaSnapshot: Record<string, number>,
  options: { ignoreExistingGroups?: boolean; variant?: number } = {}
) {
  const assignedGroups = new Map<number, IndividualScoringGroup>();
  const hasExplicitGroups = !options.ignoreExistingGroups && rows.some((row) => row.groupNumber != null);

  if (hasExplicitGroups) {
    for (const row of rows) {
      const player = playersById.get(row.playerId);
      if (!player || row.groupNumber == null) continue;
      const current = assignedGroups.get(row.groupNumber) ?? {
        key: `individual-group-${row.groupNumber}`,
        label: `Group ${row.groupNumber}`,
        groupNumber: row.groupNumber,
        playerIds: [],
        playerNames: []
      };
      current.playerIds.push(row.playerId);
      current.playerNames.push(player.name);
      assignedGroups.set(row.groupNumber, current);
    }

    return normalizeIndividualGroupOrder(Array.from(assignedGroups.values()));
  }

  const groupCount = Math.max(1, Math.ceil(rows.length / 4));
  const groups: IndividualScoringGroup[] = Array.from({ length: groupCount }, (_, index) => ({
    key: `individual-derived-${index + 1}`,
    label: `Group ${index + 1}`,
    groupNumber: index + 1,
    playerIds: [],
    playerNames: []
  }));

  const orderedRows = [...rows].sort((left, right) => {
    const leftPlayer = playersById.get(left.playerId);
    const rightPlayer = playersById.get(right.playerId);
    const leftQuota = quotaSnapshot[left.playerId] ?? leftPlayer?.quota ?? 0;
    const rightQuota = quotaSnapshot[right.playerId] ?? rightPlayer?.quota ?? 0;
    if (rightQuota !== leftQuota) return rightQuota - leftQuota;
    return (leftPlayer?.name ?? "").localeCompare(rightPlayer?.name ?? "");
  });

  const variant = options.variant ?? 0;
  const variedRows = rotateItems(
    variant % 2 === 0 ? orderedRows : [...orderedRows].reverse(),
    variant
  );

  variedRows.forEach((row, index) => {
    const player = playersById.get(row.playerId);
    const cycle = Math.floor(index / groupCount);
    const position = index % groupCount;
    const baseGroupIndex = cycle % 2 === 0 ? position : groupCount - 1 - position;
    const groupIndex = (baseGroupIndex + variant + cycle) % groupCount;
    const group = groups[groupIndex];
    group.playerIds.push(row.playerId);
    group.playerNames.push(player?.name ?? "Unknown Player");
  });

  return normalizeIndividualGroupOrder(groups.filter((group) => group.playerIds.length > 0));
}
export function RoundEditor({ round, players, quotaSnapshot, groups: initialGroups }: EditorProps) {
  const router = useRouter();
  const [roundDate, setRoundDate] = useState(formatDateInput(round.roundDate));
  const [isTestRound] = useState(Boolean(round.isTestRound));
  const [buyInPaidPlayerIds, setBuyInPaidPlayerIds] = useState<string[]>(
    round.buyInPaidPlayerIds ?? []
  );
  const [rows, setRows] = useState<RowState[]>(mapEditorEntriesToRows(round.entries));
  const [savedRows, setSavedRows] = useState<RowState[]>(mapEditorEntriesToRows(round.entries));
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState("");
  const [isPending, startTransition] = useTransition();
  const [gameMode, setGameMode] = useState<RoundMode>(round.roundMode ?? "MATCH_QUOTA");
  const [scoringEntryMode, setScoringEntryMode] = useState<ScoringEntryMode>("QUICK");
  const [setupTeamCount, setSetupTeamCount] = useState<number | null>(null);
  const [setupFormatKey, setSetupFormatKey] = useState<string | null>(null);
  const [teamBuildVariant, setTeamBuildVariant] = useState(0);
  const [scoringGroupBuildVariant, setScoringGroupBuildVariant] = useState(0);
  const [isSetupTeamEditMode, setIsSetupTeamEditMode] = useState(false);
  const [lockedAt, setLockedAt] = useState<string | null>(round.lockedAt);
  const [startedAt, setStartedAt] = useState<string | null>(round.startedAt);
  const [selectedTeam, setSelectedTeam] = useState<TeamCode | null>(null);
  const [selectedScoringGroupKey, setSelectedScoringGroupKey] = useState<string | null>(null);
  const [isAdminCorrectionMode, setIsAdminCorrectionMode] = useState(false);
  const [activeHoleByTeam, setActiveHoleByTeam] = useState<Partial<Record<TeamCode, number>>>({});
  const [skinsActiveHole, setSkinsActiveHole] = useState(1);
  const [skinsEntryOpen, setSkinsEntryOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ tone: "idle", message: "" });
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [refreshState, setRefreshState] = useState<SaveState>({ tone: "idle", message: "" });
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [isScoreEditUnlocked, setIsScoreEditUnlocked] = useState(false);
  const [scoreUnlockPassword, setScoreUnlockPassword] = useState("");
  const [scoreUnlockMessage, setScoreUnlockMessage] = useState("");
  const [isScoreUnlockOpen, setIsScoreUnlockOpen] = useState(false);
  const [pendingLockedScoreAction, setPendingLockedScoreAction] =
    useState<LockedScoreAction | null>(null);
  const [quotaAdjustmentPreview, setQuotaAdjustmentPreview] =
    useState<QuotaAdjustmentPreview | null>(null);
  const [quotaAdjustmentError, setQuotaAdjustmentError] = useState("");
  const derivedRoundName = useMemo(() => formatRoundNameFromDate(roundDate), [roundDate]);
  const displayRoundName = useMemo(() => getPreferredRoundName(round.roundName, roundDate), [round.roundName, roundDate]);
  const isSkinsOnly = gameMode === "SKINS_ONLY";
  const isQuickEntryMode = scoringEntryMode === "QUICK";
  const matchSetupPlayerCount = !isSkinsOnly && rows.length > 0 ? rows.length : null;
  const availableMatchFormats = useMemo(
    () => (matchSetupPlayerCount == null ? [] : getTeamFormats(matchSetupPlayerCount)),
    [matchSetupPlayerCount]
  );
  const selectedMatchFormat = useMemo(
    () =>
      setupFormatKey == null
        ? null
        : availableMatchFormats.find((format) => getTeamFormatKey(format) === setupFormatKey) ?? null,
    [availableMatchFormats, setupFormatKey]
  );
  const hasSupportedMatchFormat = availableMatchFormats.length > 0;
  const isLocked = Boolean(lockedAt);
  const selectedIds = useMemo(() => new Set(rows.map((row) => row.playerId)), [rows]);
  const assignedSetupPlayerIds = useMemo(
    () => new Set(rows.filter((row) => row.team != null).map((row) => row.playerId)),
    [rows]
  );
  const playersById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players]
  );

  const filteredPlayers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...players]
      .sort((a, b) => {
        if (a.isRegular !== b.isRegular) return a.isRegular ? -1 : 1;
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .filter((player) => {
        if (selectedIds.has(player.id) || !player.isActive || isLocked) return false;
        return !query || player.name.toLowerCase().includes(query);
      });
  }, [isLocked, players, search, selectedIds]);
  const availableSetupPlayers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...players]
      .sort((a, b) => {
        if (a.isRegular !== b.isRegular) return a.isRegular ? -1 : 1;
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .filter((player) => {
        if (!player.isActive || isLocked) return false;
        if (assignedSetupPlayerIds.has(player.id)) return false;
        return !query || player.name.toLowerCase().includes(query);
      });
  }, [assignedSetupPlayerIds, isLocked, players, search]);

  const setupTeamCodes = useMemo(
    () =>
      isSkinsOnly || !selectedMatchFormat
        ? []
        : teamOptions.slice(0, selectedMatchFormat.teamCount),
    [isSkinsOnly, selectedMatchFormat]
  );
  const calculatedRows = useMemo(() => {
    return calculateRoundRows(
      rows
        .map((row) => {
          const player = playersById.get(row.playerId);
          if (!player) return null;
          return {
            playerId: row.playerId,
            playerName: player.name,
            team: row.team,
          groupNumber: row.groupNumber,
          teeTime: row.teeTime,
            startQuota: quotaSnapshot[row.playerId] ?? player.quota,
            holeScores: row.holeScores,
            scoringEntryMode,
            quickFrontNine: row.quickFrontNine,
            quickBackNine: row.quickBackNine,
            birdieHoles: parseBirdieHolesInput(row.birdieHolesText)
          };
        })
        .filter(Boolean) as Array<{
          playerId: string;
          playerName: string;
          team: TeamCode | null;
          startQuota: number;
          holeScores: Array<number | null>;
          scoringEntryMode: ScoringEntryMode;
          quickFrontNine: number | null;
          quickBackNine: number | null;
          birdieHoles: number[];
        }>
    );
  }, [playersById, quotaSnapshot, rows, scoringEntryMode]);

  const teamStandings = useMemo(() => calculateTeamStandings(calculatedRows), [calculatedRows]);
  const sideGames = useMemo(() => calculateSideGameResults(calculatedRows), [calculatedRows]);
  const payoutSummary = useMemo(
    () =>
      calculatePayoutPredictions(calculatedRows, {
        includeTeamPayouts: gameMode !== "SKINS_ONLY",
        includeIndividualPayouts: true,
        includeSkinsPayouts: true
      }),
    [calculatedRows, gameMode]
  );
  const invalidSequence = isQuickEntryMode ? false : rows.some((row) => !hasSequentialHoleEntry(row.holeScores));
  const hasSavedScores = useMemo(
    () =>
      rows.some((row) =>
        isQuickEntryMode
          ? row.quickFrontNine != null || row.quickBackNine != null || row.birdieHolesText.trim().length > 0
          : row.holeScores.some((score) => score != null)
      ),
    [isQuickEntryMode, rows]
  );
  const allFrontSubmitted = rows.length > 0 && rows.every((row) => hasSubmittedFrontNine(row));
  const allBackSubmitted = rows.length > 0 && rows.every((row) => hasSubmittedBackNine(row));
  const quickEntryRows = useMemo(() => {
    const calculatedByPlayerId = new Map(calculatedRows.map((row) => [row.playerId, row]));
    return rows
      .map((row) => {
        const player = playersById.get(row.playerId);
        const calculated = calculatedByPlayerId.get(row.playerId);
        if (!player || !calculated) {
          return null;
        }

        return {
          playerId: row.playerId,
          playerName: player.name,
          team: row.team,
          groupNumber: row.groupNumber,
          teeTime: row.teeTime,
          startQuota: calculated.startQuota,
          quickFrontNine: row.quickFrontNine,
          quickBackNine: row.quickBackNine,
          birdieHolesText: row.birdieHolesText,
          totalPoints: calculated.totalPoints,
          plusMinus: calculated.plusMinus,
          nextQuota: calculated.nextQuota
        };
      })
      .filter(Boolean) as Array<{
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
      }>;
  }, [calculatedRows, playersById, rows]);

  const setupValidation = useMemo(() => {
    if (isSkinsOnly) {
      if (!rows.length) {
        return { valid: false, reason: "Add players before starting Individual Quota + Skins." };
      }

      if (rows.some((row) => row.groupNumber == null)) {
        return { valid: false, reason: "Build foursomes before starting round." };
      }

      return { valid: true, reason: "" };
    }

    if (matchSetupPlayerCount == null) {
      return {
        valid: false,
        reason: "Add players to choose a supported team format."
      };
    }

    if (setupTeamCount == null) {
      return { valid: false, reason: "Choose a team format." };
    }

    if (!selectedMatchFormat) {
      return {
        valid: false,
        reason:
          availableMatchFormats.length === 0
            ? `Invalid team setup for ${matchSetupPlayerCount} players. Choose a supported field size.`
            : "Choose a team format."
      };
    }

    if (rows.length !== matchSetupPlayerCount) {
      return {
        valid: false,
        reason: `Assign ${matchSetupPlayerCount} players before finishing teams.`
      };
    }

    if (rows.some((row) => row.team == null)) {
      return {
        valid: false,
        reason: "Build teams before starting round."
      };
    }

    for (const [index, team] of setupTeamCodes.entries()) {
      const requiredPlayers = selectedMatchFormat.capacities[index] ?? 0;
      const assignedPlayers = rows.filter((row) => row.team === team).length;
      if (assignedPlayers !== requiredPlayers) {
        return {
          valid: false,
          reason: `${getSetupTeamLabel(team)} needs ${requiredPlayers} players. It currently has ${assignedPlayers}.`
        };
      }
    }

    return { valid: true, reason: "" };
  }, [availableMatchFormats.length, isSkinsOnly, matchSetupPlayerCount, rows, selectedMatchFormat, setupTeamCodes, setupTeamCount]);

  const setupTeams = useMemo(() => {
    return setupTeamCodes.map((team) => {
      const teamRows = rows.filter((row) => row.team === team);
      const totalQuota = teamRows.reduce((sum, row) => {
        const player = playersById.get(row.playerId);
      return sum + (player ? quotaSnapshot[row.playerId] ?? player.quota : 0);
      }, 0);

      return {
        team,
        players: teamRows.map((row) => {
          const player = playersById.get(row.playerId);
          return {
            playerId: row.playerId,
            playerName: player?.name ?? "Unknown Player",
            quota: player
        ? quotaSnapshot[row.playerId] ?? player.quota
              : 0
          };
        }),
        totalQuota
      };
    });
  }, [playersById, quotaSnapshot, rows, setupTeamCodes]);

  const canStartConfiguredRound = rows.length > 0 && setupValidation.valid;
  const individualScoringGroupsPreview = useMemo(
    () => buildIndividualScoringGroups(rows, playersById, quotaSnapshot),
    [playersById, quotaSnapshot, rows]
  );
  const hasAssignedScoringGroups =
    rows.length > 0 &&
    (isSkinsOnly
      ? rows.every((row) => row.groupNumber != null)
      : rows.every((row) => row.team == null || row.groupNumber != null));
  const setupScoringGroupsPreview = useMemo(
    () =>
      isSkinsOnly
        ? []
        : buildScoringGroups(
            rows,
            teamStandings,
            new Map(calculatedRows.map((row) => [row.playerId, row.playerName])),
            initialGroups
          ),
    [calculatedRows, initialGroups, isSkinsOnly, rows, teamStandings]
  );
  const hasAutoBuiltTeams =
    !isSkinsOnly &&
    selectedMatchFormat != null &&
    rows.length === matchSetupPlayerCount &&
    rows.length > 0 &&
    rows.every((row) => row.team != null);
  const completedSetupTeamCount = useMemo(() => {
    return setupTeamCodes.filter((team, index) => {
      const requiredPlayers = selectedMatchFormat?.capacities[index] ?? 0;
      const assignedPlayers = rows.filter((row) => row.team === team).length;
      return requiredPlayers > 0 && assignedPlayers === requiredPlayers;
    }).length;
  }, [rows, selectedMatchFormat, setupTeamCodes]);
  const teamQuotaSpread = useMemo(() => {
    if (!setupTeams.length) {
      return 0;
    }

    const totals = setupTeams.map((team) => team.totalQuota);
    return Math.max(...totals) - Math.min(...totals);
  }, [setupTeams]);

  const groupChatText = useMemo(() => {
    const golf = "\uD83C\uDFCC\uFE0F\u200D\u2642\uFE0F";
    const money = "\uD83D\uDCB0";
    const clover = "\uD83C\uDF40";
    const arrow = "\u2192";
    const dash = "\u2013";
    const bullet = "\u2022";
    const lines = [`${golf} GOLF QUOTA TEAMS ${dash} ${displayRoundName}`, ""];

    if (isSkinsOnly) {
      if (!individualScoringGroupsPreview.length) {
        return "";
      }

      for (const group of individualScoringGroupsPreview) {
        const playersText = group.playerIds
          .map((playerId) => {
            const player = playersById.get(playerId);
            const quota = player ? quotaSnapshot[playerId] ?? player.quota : 0;
            return `${player?.name ?? "Unknown Player"} (${quota})`;
          })
          .join(" + ");
        const totalQuota = group.playerIds.reduce((sum, playerId) => {
          const player = playersById.get(playerId);
          return sum + (player ? quotaSnapshot[playerId] ?? player.quota : 0);
        }, 0);
        lines.push(group.label);
        lines.push(`${playersText} ${arrow} ${totalQuota}`);
        lines.push("");
      }

      lines.push(`${money} $40 Per Man`);
      lines.push(`${bullet} $5 Front ${dash} individual quota front 9`);
      lines.push(`${bullet} $5 Back ${dash} individual quota back 9`);
      lines.push(`${bullet} $10 Total ${dash} individual quota total`);
      lines.push(`${bullet} $20 Skins`);
      lines.push("");
      lines.push(`Good luck boys ${clover}${golf}`);
      return lines.join("\n");
    }

    if (!setupTeams.length || !setupScoringGroupsPreview.length) {
      return "";
    }

    const teamByCode = new Map(setupTeams.map((team) => [team.team, team]));

    for (const group of setupScoringGroupsPreview) {
      lines.push(group.label);
      for (const teamCode of group.teams) {
        const team = teamByCode.get(teamCode);
        if (!team) continue;
        const playersText = team.players
          .map((player) => `${player.playerName} (${player.quota})`)
          .join(" + ");
        lines.push(`${teamCode}: ${playersText} ${arrow} ${team.totalQuota}`);
      }
      lines.push("");
    }

    lines.push(`${money} $40 Per Man`);
    lines.push(`${bullet} $5 Front ${dash} best team front 9`);
    lines.push(`${bullet} $5 Back ${dash} best team back 9`);
    lines.push(`${bullet} $10 Total ${dash} best team total`);
    lines.push(`${bullet} $10 Individual Quota`);
    lines.push(`${bullet} $10 Skins`);
    lines.push("");
    lines.push(`Good luck boys ${clover}${golf}`);

    return lines.join("\n");
  }, [displayRoundName, individualScoringGroupsPreview, isSkinsOnly, playersById, quotaSnapshot, setupScoringGroupsPreview, setupTeams]);

  useEffect(() => {
    if (isSkinsOnly) {
      return;
    }

    if (availableMatchFormats.length === 1) {
      const onlyFormat = availableMatchFormats[0];
      const onlyFormatKey = getTeamFormatKey(onlyFormat);
      if (setupFormatKey !== onlyFormatKey) {
        setSetupFormatKey(onlyFormatKey);
        setSetupTeamCount(onlyFormat.teamCount);
        setTeamBuildVariant(0);
      }
      return;
    }

    if (
      setupFormatKey != null &&
      !availableMatchFormats.some((format) => getTeamFormatKey(format) === setupFormatKey)
    ) {
      setSetupFormatKey(null);
      setSetupTeamCount(null);
      setTeamBuildVariant(0);
    }
  }, [availableMatchFormats, isSkinsOnly, setupFormatKey]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 1000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const nextRows = mapEditorEntriesToRows(round.entries);
    setRows(nextRows);
    setSavedRows(nextRows.map((row) => ({ ...row, holeScores: [...row.holeScores] })));
    setRoundDate(formatDateInput(round.roundDate));
    setSetupTeamCount(null);
    setSetupFormatKey(null);
    setTeamBuildVariant(0);
    setBuyInPaidPlayerIds(round.buyInPaidPlayerIds ?? []);
    setLockedAt(round.lockedAt);
    setStartedAt(round.startedAt);
    setGameMode(round.roundMode ?? "MATCH_QUOTA");
    setScoringEntryMode("QUICK");
    setActiveHoleByTeam((current) => {
      const nextState: Partial<Record<TeamCode, number>> = {};

      for (const [team, hole] of Object.entries(current) as Array<[TeamCode, number]>) {
        if (nextRows.some((row) => row.team === team)) {
          nextState[team] = Math.max(1, Math.min(18, hole));
        }
      }

      return nextState;
    });
    setSkinsActiveHole(getSuggestedHole(calculateRoundRows(
      nextRows
        .map((row) => {
          const player = playersById.get(row.playerId);
          if (!player) return null;
          return {
            playerId: row.playerId,
            playerName: player.name,
            team: row.team,
            startQuota: quotaSnapshot[row.playerId] ?? player.quota,
            holeScores: row.holeScores
          };
        })
        .filter(Boolean) as Array<{
          playerId: string;
          playerName: string;
          team: TeamCode | null;
          startQuota: number;
          holeScores: Array<number | null>;
        }>
    )));
    console.info("[live-round] synced-editor-from-server", {
      roundId: round.id,
      entries: nextRows.map((row) => ({
        playerId: row.playerId,
        team: row.team,
        completedHoles: row.holeScores.filter((score) => score != null).length,
        frontSubmittedAt: row.frontSubmittedAt,
        backSubmittedAt: row.backSubmittedAt
      }))
    });
  }, [playersById, quotaSnapshot, round.buyInPaidPlayerIds, round.entries, round.id, round.lockedAt, round.roundDate, round.roundMode, round.startedAt, round.teamCount]);

  useEffect(() => {
    if (!selectedTeam) {
      return;
    }

    if (activeHoleByTeam[selectedTeam] != null) {
      return;
    }

    const teamRows = rows.filter((row) => row.team === selectedTeam);
    if (!teamRows.length) {
      return;
    }

    setActiveHoleByTeam((current) => ({
      ...current,
      [selectedTeam]: getCheckpointAwareTeamHole(teamRows)
    }));
  }, [activeHoleByTeam, rows, selectedTeam]);

  useEffect(() => {
    if (isLocked) {
      return;
    }

    if (isSkinsOnly) {
      setRows((current) =>
        current.map((row) => (row.team == null ? row : { ...row, team: null }))
      );
      return;
    }

    const validTeams = new Set(setupTeamCodes);
    setRows((current) =>
      current.map((row) =>
        row.team != null && !validTeams.has(row.team)
          ? { ...row, team: null, groupNumber: null, teeTime: null }
          : row
      )
    );
  }, [isLocked, isSkinsOnly, setupTeamCodes]);

  useEffect(() => {
    if (isSkinsOnly) {
      return;
    }
  }, [isSkinsOnly]);

  async function persistRound(
      nextRows = rows,
      nextLockedAt = lockedAt,
      nextStartedAt = startedAt,
      nextTeamCount = setupTeamCount == null ? "" : String(setupTeamCount),
    nextRoundName = displayRoundName,
    nextRoundDate = roundDate,
    nextNotes = round.notes,
      forceComplete = false
    ) {
      const resolvedTeamCount =
        gameMode === "SKINS_ONLY"
          ? null
          : nextTeamCount === "" || nextTeamCount == null
            ? (round.teamCount ?? null)
            : Number(nextTeamCount);

      const payload = {
        roundName: nextRoundName,
        roundDate: nextRoundDate,
        roundMode: gameMode,
        scoringEntryMode,
        isTestRound,
        notes: nextNotes,
        teamCount: resolvedTeamCount,
        lockedAt: nextLockedAt,
        startedAt: nextStartedAt,
        forceComplete,
        entries: nextRows.map((row) => ({
          playerId: row.playerId,
          team: row.team,
          groupNumber: row.groupNumber,
          teeTime: row.teeTime,
          frontSubmittedAt: row.frontSubmittedAt,
          backSubmittedAt: row.backSubmittedAt,
          quickFrontNine: row.quickFrontNine,
          quickBackNine: row.quickBackNine,
          birdieHoles: parseGoodSkinEntriesInput(row.birdieHolesText).map((entry) => formatGoodSkinEntriesInput([entry])),
          holes: row.holeScores
        }))
      };

    const response = await fetch(`/api/rounds/${round.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error ?? "Could not save round.");
    }
  }

  function addPlayer(playerId: string) {
    setRows((current) => [
      ...current,
      {
        playerId,
        team: null,
        groupNumber: null,
        teeTime: null,
        quickFrontNine: null,
        quickBackNine: null,
        birdieHolesText: "",
        frontSubmittedAt: null,
        backSubmittedAt: null,
        holeScores: Array.from({ length: 18 }, () => null)
      }
    ]);
    setSearch("");
    setTeamBuildVariant(0);
  }

  function autoBuildMatchQuotaTeams(requireDifferent = false) {
    if (isSkinsOnly) {
      return;
    }

    if (matchSetupPlayerCount == null) {
      setMessage("Add players to choose a supported team format.");
      return;
    }

    if (setupTeamCount == null || !selectedMatchFormat) {
      setMessage(
          availableMatchFormats.length === 0
            ? `Invalid team setup for ${matchSetupPlayerCount} players. Choose a supported field size.`
            : "Choose a team format."
      );
      return;
    }

    const setupPlayers = rows
      .map((row) => {
        const player = playersById.get(row.playerId);
        if (!player) {
          return null;
        }

        return {
          playerId: row.playerId,
          playerName: player.name,
          quota: quotaSnapshot[row.playerId] ?? player.quota,
          conflictIds: player.conflictIds
        };
      })
      .filter(Boolean) as Array<{
      playerId: string;
      playerName: string;
      quota: number;
      conflictIds: string[];
    }>;

    try {
      const teamCodes = teamOptions.slice(0, selectedMatchFormat.teamCount) as TeamCode[];
      const capacities = capacitiesToMap(teamCodes, selectedMatchFormat.capacities);
      const currentAssignments = new Map(rows.map((row) => [row.playerId, row.team ?? null]));
      let selectedAssignments: Map<string, TeamCode> | null = null;
      let chosenVariant = teamBuildVariant;
      const maxVariants = Math.max(8, teamCodes.length * 6);

      for (let attempt = 0; attempt < maxVariants; attempt += 1) {
        const variant = requireDifferent ? teamBuildVariant + attempt + 1 : teamBuildVariant + attempt;
        const assignments = buildBalancedTeams(setupPlayers, teamCodes, capacities, { variant });
        const teamByPlayerId = new Map(assignments.map((assignment) => [assignment.playerId, assignment.team]));
        const differs = rows.some(
          (row) => (teamByPlayerId.get(row.playerId) ?? null) !== (currentAssignments.get(row.playerId) ?? null)
        );

        if (!requireDifferent || differs) {
          selectedAssignments = teamByPlayerId;
          chosenVariant = variant;
          break;
        }
      }

      if (!selectedAssignments) {
        setMessage("No alternate balanced rebuild was found for this format.");
        return;
      }

      setRows((current) =>
        current.map((row) => ({
          ...row,
          team: selectedAssignments.get(row.playerId) ?? null
        }))
      );
      setSavedRows((current) =>
        current.map((row) => ({
          ...row,
          team: selectedAssignments.get(row.playerId) ?? null
        }))
      );
      setTeamBuildVariant(chosenVariant);
      setMessage(
        requireDifferent
          ? "Teams rebuilt with a new balanced arrangement."
          : "Teams built automatically. Review the balance below before starting the round."
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not auto-build balanced teams."
      );
    }
  }

  function addPlayerToSetupTeam(playerId: string, destinationTeam: TeamCode) {
    const existingRow = rows.find((row) => row.playerId === playerId);
    const teamIndex = setupTeamCodes.indexOf(destinationTeam);
    const requiredPlayers = selectedMatchFormat?.capacities[teamIndex] ?? 0;
    const assignedPlayers = rows.filter((row) => row.team === destinationTeam).length;

    if (requiredPlayers > 0 && assignedPlayers >= requiredPlayers && (!existingRow || existingRow.team !== destinationTeam)) {
      setMessage(`${getSetupTeamLabel(destinationTeam)} already has its required ${requiredPlayers} players.`);
      return;
    }

    if (existingRow) {
      if (existingRow.team === destinationTeam) {
        return;
      }

      setRows((current) =>
        current.map((row) =>
          row.playerId === playerId ? { ...row, team: destinationTeam } : row
        )
      );
    } else {
      setRows((current) => [
        ...current,
        {
          playerId,
          team: destinationTeam,
          groupNumber: null,
          teeTime: null,
          quickFrontNine: null,
          quickBackNine: null,
          birdieHolesText: "",
          frontSubmittedAt: null,
          backSubmittedAt: null,
          holeScores: Array.from({ length: 18 }, () => null)
        }
      ]);
    }

    const player = playersById.get(playerId);
    setSearch("");
    setMessage(`${player?.name ?? "Player"} added to ${getSetupTeamLabel(destinationTeam)}.`);
  }

  function getScoringGroupSignature(sourceRows: RowState[]) {
    return sourceRows
      .map((row) => `${row.playerId}:${row.team ?? "-"}:${row.groupNumber ?? "-"}:${row.teeTime ?? "-"}`)
      .sort()
      .join("|");
  }

  async function copyTeamsForGroupChat() {
    if (!groupChatText) {
      setMessage("Build teams and foursomes before copying.");
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(groupChatText);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = groupChatText;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setToast("Copied to clipboard");
      setMessage("");
    } catch {
      setMessage("Could not copy teams. Try again from your browser.");
    }
  }
  function autoAssignScoringGroups() {
    if (isSkinsOnly) {
      return;
    }

    if (!hasAutoBuiltTeams || rows.some((row) => row.team == null)) {
      setMessage("Build teams before assigning playing groups.");
      return;
    }

    const rebuilding = hasAssignedScoringGroups;
    const currentSignature = getScoringGroupSignature(rows);
    let selectedRows: RowState[] | null = null;
    let selectedGroups: ScoringGroup[] = [];
    let selectedVariant = scoringGroupBuildVariant;
    const maxVariants = Math.max(8, setupTeamCodes.length * 4);

    for (let attempt = 0; attempt < maxVariants; attempt += 1) {
      const variant = rebuilding ? scoringGroupBuildVariant + attempt + 1 : scoringGroupBuildVariant + attempt;
      const sourceRows = rebuilding
        ? rows.map((row) => ({ ...row, groupNumber: null, teeTime: null }))
        : rows;
      const previewGroups = buildScoringGroups(
        sourceRows,
        teamStandings,
        new Map(calculatedRows.map((row) => [row.playerId, row.playerName])),
        rebuilding ? [] : initialGroups,
        { ignoreExistingGroups: rebuilding, variant }
      );

      if (!previewGroups.length) {
        continue;
      }

      const groupNumberByTeam = new Map<TeamCode, number | null>();
      const teeTimeByTeam = new Map<TeamCode, string | null>();

      for (const group of previewGroups) {
        for (const team of group.teams) {
          groupNumberByTeam.set(team, group.groupNumber);
          teeTimeByTeam.set(team, group.teeTime);
        }
      }

      const orderedRows = previewGroups.flatMap((group) =>
        rows.filter((row) => row.team != null && group.teams.includes(row.team))
      );
      const remainingRows = rows.filter(
        (row) => !orderedRows.some((orderedRow) => orderedRow.playerId === row.playerId)
      );
      const nextRows = [...orderedRows, ...remainingRows].map((row) => ({
        ...row,
        groupNumber: row.team ? groupNumberByTeam.get(row.team) ?? null : null,
        teeTime: row.team ? teeTimeByTeam.get(row.team) ?? null : null
      }));

      selectedRows = nextRows;
      selectedGroups = previewGroups;
      selectedVariant = variant;

      if (!rebuilding || getScoringGroupSignature(nextRows) !== currentSignature) {
        break;
      }
    }

    if (!selectedRows || !selectedGroups.length) {
      setMessage("Could not build playing groups for this round.");
      return;
    }

    const changed = getScoringGroupSignature(selectedRows) !== currentSignature;
    setRows(selectedRows);
    setSavedRows(selectedRows.map((row) => ({ ...row, holeScores: [...row.holeScores] })));
    setSelectedScoringGroupKey(selectedGroups[0]?.key ?? null);
    setScoringGroupBuildVariant(selectedVariant);
    setMessage(
      rebuilding
        ? changed
          ? "Foursomes rebuilt."
          : "Groups are already balanced."
        : "Playing groups assigned. Live scoring will stay scoped to these foursomes."
    );
  }

  function autoAssignIndividualScoringGroups() {
    if (!isSkinsOnly) {
      return;
    }

    if (!rows.length) {
      setMessage("Add players before building foursomes.");
      return;
    }

    const rebuilding = hasAssignedScoringGroups;
    const currentSignature = getScoringGroupSignature(rows);
    let selectedRows: RowState[] | null = null;
    let selectedGroups: IndividualScoringGroup[] = [];
    let selectedVariant = scoringGroupBuildVariant;
    const maxVariants = Math.max(8, Math.ceil(rows.length / 4) * 6);

    for (let attempt = 0; attempt < maxVariants; attempt += 1) {
      const variant = rebuilding ? scoringGroupBuildVariant + attempt + 1 : scoringGroupBuildVariant + attempt;
      const previewGroups = buildIndividualScoringGroups(
        rows.map((row) => ({ ...row, groupNumber: null, teeTime: null })),
        playersById,
        quotaSnapshot,
        { ignoreExistingGroups: true, variant }
      );

      const groupNumberByPlayerId = new Map<string, number>();
      for (const group of previewGroups) {
        for (const playerId of group.playerIds) {
          groupNumberByPlayerId.set(playerId, group.groupNumber);
        }
      }

      const orderedRows = previewGroups.flatMap((group) =>
        group.playerIds
          .map((playerId) => rows.find((row) => row.playerId === playerId))
          .filter(Boolean) as RowState[]
      );
      const remainingRows = rows.filter(
        (row) => !orderedRows.some((orderedRow) => orderedRow.playerId === row.playerId)
      );
      const nextRows = [...orderedRows, ...remainingRows].map((row) => ({
        ...row,
        team: null,
        groupNumber: groupNumberByPlayerId.get(row.playerId) ?? null,
        teeTime: null
      }));

      selectedRows = nextRows;
      selectedGroups = previewGroups;
      selectedVariant = variant;

      if (!rebuilding || getScoringGroupSignature(nextRows) !== currentSignature) {
        break;
      }
    }

    if (!selectedRows || !selectedGroups.length) {
      setMessage("Could not build foursomes for this round.");
      return;
    }

    const changed = getScoringGroupSignature(selectedRows) !== currentSignature;
    setRows(selectedRows);
    setSavedRows(selectedRows.map((row) => ({ ...row, holeScores: [...row.holeScores] })));
    setScoringGroupBuildVariant(selectedVariant);
    setMessage(
      rebuilding
        ? changed
          ? "Foursomes rebuilt."
          : "Groups are already balanced."
        : "Balanced foursomes built for Individual Quota + Skins."
    );
  }
  function removePlayer(playerId: string) {
    if (isLocked) return;
    const targetPlayer = playersById.get(playerId);
    const confirmed = window.confirm(
      `Remove ${targetPlayer?.name ?? "this player"} from the round setup?`
    );
    if (!confirmed) {
      return;
    }
    setRows((current) => current.filter((row) => row.playerId !== playerId).map((row) => ({ ...row, groupNumber: null, teeTime: null })));
    setSavedRows((current) => current.filter((row) => row.playerId !== playerId).map((row) => ({ ...row, groupNumber: null, teeTime: null })));
    setTeamBuildVariant(0);
    setMessage(`${targetPlayer?.name ?? "Player"} removed from the round.`);
  }

  function updateHole(playerId: string, holeIndex: number, value: number | null) {
    const row = rows.find((candidate) => candidate.playerId === playerId);
    if (row && isHoleLockedForRow(row, holeIndex) && !isScoreEditUnlocked) {
      openLockedScorePrompt({ type: "update-score", playerId, holeIndex, value });
      return;
    }

    setSaveState({ tone: "idle", message: "" });
    setRows((current) =>
      current.map((row) =>
        row.playerId === playerId
          ? {
              ...row,
              holeScores: row.holeScores.map((score, index) =>
                index === holeIndex ? value : score
              )
            }
          : row
      )
    );
  }

  function parseQuickEntryNumber(value: string) {
    if (value.trim() === "") {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }

  function syncQuickEntrySubmissionState(row: RowState) {
    if (row.quickFrontNine == null) {
      return {
        ...row,
        frontSubmittedAt: null,
        backSubmittedAt: null
      };
    }

    const frontSubmittedAt = row.frontSubmittedAt ?? new Date().toISOString();
    return {
      ...row,
      frontSubmittedAt,
      backSubmittedAt: row.quickBackNine == null ? null : row.backSubmittedAt ?? frontSubmittedAt
    };
  }

  function updateQuickFrontNine(playerId: string, value: string) {
    setSaveState({ tone: "idle", message: "" });
    setRows((current) =>
      current.map((row) =>
        row.playerId === playerId
          ? syncQuickEntrySubmissionState({
              ...row,
              quickFrontNine: parseQuickEntryNumber(value)
            })
          : row
      )
    );
  }

  function updateQuickBackNine(playerId: string, value: string) {
    setSaveState({ tone: "idle", message: "" });
    setRows((current) =>
      current.map((row) =>
        row.playerId === playerId
          ? syncQuickEntrySubmissionState({
              ...row,
              quickBackNine: parseQuickEntryNumber(value)
            })
          : row
      )
    );
  }

  function updateQuickBirdieHoles(playerId: string, value: string) {
    setSaveState({ tone: "idle", message: "" });
    setRows((current) =>
      current.map((row) =>
        row.playerId === playerId
          ? {
              ...row,
              birdieHolesText: value
            }
          : row
      )
    );
  }

  function setSaving(messageText: string) {
    setSaveState({ tone: "saving", message: messageText });
  }

  function setSaved(messageText: string) {
    setSaveState({ tone: "saved", message: messageText });
    setLastSavedAt(new Date().toISOString());
  }

  function setSaveFailed(messageText: string) {
    setSaveState({ tone: "failed", message: messageText });
  }

  async function refreshRoundData() {
    try {
      setRefreshState({ tone: "saving", message: "Refreshing..." });
      const response = await fetch(`/api/rounds/${round.id}`, {
        method: "GET",
        cache: "no-store"
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Could not refresh round.");
      }

      router.refresh();
      setLastRefreshedAt(new Date().toISOString());
      setRefreshState({ tone: "saved", message: "Updated" });
    } catch (error) {
      setRefreshState({
        tone: "failed",
        message: error instanceof Error ? error.message : "Refresh failed"
      });
    }
  }

  function openLockedScorePrompt(action: LockedScoreAction) {
    setPendingLockedScoreAction(action);
    setScoreUnlockPassword("");
    setScoreUnlockMessage("");
    setIsScoreUnlockOpen(true);
  }

  function applyLockedScoreAction(action: LockedScoreAction) {
    if (action.type === "select-hole") {
      setActiveHoleByTeam((current) => ({
        ...current,
        [action.team]: Math.max(1, Math.min(18, action.hole))
      }));
      return;
    }

    setRows((current) =>
      current.map((row) =>
        row.playerId === action.playerId
          ? {
              ...row,
              holeScores: row.holeScores.map((score, index) =>
                index === action.holeIndex ? action.value : score
              )
            }
          : row
      )
    );
  }

  async function unlockSubmittedScoreEditing() {
    try {
      setScoreUnlockMessage("");
      const response = await fetch("/api/rounds/unlock-score-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: scoreUnlockPassword })
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Incorrect password.");
      }

      setIsScoreEditUnlocked(true);
      setIsScoreUnlockOpen(false);

      if (pendingLockedScoreAction) {
        applyLockedScoreAction(pendingLockedScoreAction);
      }

      setPendingLockedScoreAction(null);
      setScoreUnlockPassword("");
      setScoreUnlockMessage("");
    } catch (error) {
      setScoreUnlockMessage(
        error instanceof Error ? error.message : "Could not unlock score editing."
      );
    }
  }

  async function submitSegment(playerId: string, segment: "front" | "back") {
    const playerRow = rows.find((row) => row.playerId === playerId);
    if (!playerRow) {
      setMessage("Player entry not found.");
      return;
    }

    if (segment === "front" && !hasCompletedSegment(playerRow.holeScores, 0, 9)) {
      setMessage("Save holes 1 through 9 before submitting the front nine.");
      return;
    }

    if (segment === "back") {
      if (!playerRow.frontSubmittedAt) {
        setMessage("Submit the front nine before submitting the back nine.");
        return;
      }

      if (!hasCompletedSegment(playerRow.holeScores, 9, 18)) {
        setMessage("Save holes 10 through 18 before submitting the back nine.");
        return;
      }
    }

    const confirmed = window.confirm(
      segment === "front"
        ? "Are you sure you want to submit your front nine?"
        : "Are you sure you want to submit your back nine?"
    );

    if (!confirmed) {
      return;
    }

    const submittedAt = new Date().toISOString();
    const nextRows = rows.map((row) =>
      row.playerId === playerId
        ? {
            ...row,
            frontSubmittedAt: segment === "front" ? submittedAt : row.frontSubmittedAt,
            backSubmittedAt: segment === "back" ? submittedAt : row.backSubmittedAt
          }
        : row
    );

    startTransition(async () => {
      try {
        setMessage("");
        setSaving(segment === "front" ? "Saving and submitting front nine..." : "Saving and submitting back nine...");
        await persistRound(nextRows);
        const response = await fetch(`/api/rounds/${round.id}/submit-segment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId, segment })
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error ?? "Could not submit this segment.");
        }

        setRows(nextRows);
        setSavedRows(nextRows.map((row) => ({ ...row, holeScores: [...row.holeScores] })));
        if (segment === "front") {
          setSaved(result.allFrontSubmitted ? "Front nine submitted. Front result is now ready." : "Front nine submitted.");
          setMessage(
            result.allFrontSubmitted
              ? "All front nines are in. Front-nine result is ready below."
              : "Front nine submitted."
          );
        } else {
          setSaved("Back nine submitted.");
          setMessage(
            result.allBackSubmitted
              ? "All back nines are in. Review final results on Current Round, then archive the round."
              : "Back nine submitted."
          );
        }

        router.refresh();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Could not submit this segment.";
        setSaveFailed(errorMessage);
        setMessage(errorMessage);
      }
    });
  }

  async function submitScoringGroupSegment(
    team: TeamCode,
    segment: "front" | "back",
    workingRows: RowState[]
  ) {
    const scoringGroup = getScoringGroupByTeam(team, workingRows);
    const groupTeams = scoringGroup?.teams ?? [team];
    const groupPlayerIds = workingRows
      .filter((row) => row.team != null && groupTeams.includes(row.team))
      .map((row) => row.playerId);

    if (!groupPlayerIds.length) {
      throw new Error(`No players found for ${scoringGroup?.label ?? `Team ${team}`}.`);
    }

    for (const playerId of groupPlayerIds) {
      const response = await fetch(`/api/rounds/${round.id}/submit-segment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, segment })
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Could not submit this segment.");
      }
    }

    const submittedAt = new Date().toISOString();
    const nextRows = workingRows.map((row) =>
      row.team != null && groupTeams.includes(row.team)
        ? {
            ...row,
            frontSubmittedAt: segment === "front" ? submittedAt : row.frontSubmittedAt,
            backSubmittedAt: segment === "back" ? submittedAt : row.backSubmittedAt
          }
        : row
    );

    setRows(nextRows);
    setSavedRows(nextRows.map((row) => ({ ...row, holeScores: [...row.holeScores] })));

    if (segment === "front") {
      setActiveHoleForGroup(groupTeams, 10);
      setSelectedTeam(team);
      setSaved("Front nine submitted. Hole 10 ready.");
      setMessage(`${scoringGroup?.label ?? `Team ${team}`} front nine submitted. Continue with hole 10.`);
    } else {
      setSelectedTeam(null);
      setSaved("Final score submitted.");
      setMessage(
        `${scoringGroup?.label ?? `Team ${team}`} final score submitted. Review results below once every team submits, then archive the round.`
      );
    }

    router.refresh();
  }

  function assignSetupPlayer(playerId: string, destinationTeam: TeamCode) {
    const sourceRow = rows.find((row) => row.playerId === playerId);
    if (!sourceRow || sourceRow.team === destinationTeam) {
      return;
    }

    const teamIndex = setupTeamCodes.indexOf(destinationTeam);
    const requiredPlayers = selectedMatchFormat?.capacities[teamIndex] ?? 0;
    const assignedPlayers = rows.filter((row) => row.team === destinationTeam).length;

    if (requiredPlayers > 0 && assignedPlayers >= requiredPlayers) {
      setMessage(`${getSetupTeamLabel(destinationTeam)} already has its required ${requiredPlayers} players.`);
      return;
    }

    setRows((current) =>
      current.map((row) =>
        row.playerId === playerId ? { ...row, team: destinationTeam } : row
      )
    );
    setTeamBuildVariant(0);
    setMessage(
      sourceRow.team
        ? `Moved player to Team ${destinationTeam}.`
        : `Assigned player to Team ${destinationTeam}.`
    );
  }

  function clearSetupPlayerAssignment(playerId: string) {
    const sourceRow = rows.find((row) => row.playerId === playerId);
    if (!sourceRow?.team) {
      return;
    }

    setRows((current) =>
      current.map((row) => {
        if (row.playerId !== playerId) return row;
        return { ...row, team: null };
      })
    );
    setMessage("Player moved back to unassigned.");
  }

  function deleteRound() {
    const isLiveRound = Boolean(isLocked || startedAt);
    const confirmationMessage = isTestRound
      ? hasSavedScores
        ? "Are you sure you want to delete this test round? All saved scores for this test round will be removed."
        : "Are you sure you want to delete this test round?"
      : isLiveRound
        ? hasSavedScores
          ? "This round already has saved scores and cannot be deleted here."
          : "Are you sure you want to delete this round?"
        : "Are you sure you want to delete this round?";

    if (hasSavedScores && isLiveRound && !isTestRound) {
      setMessage("This round already has saved scores. Complete it instead of deleting it.");
      return;
    }

    if (!window.confirm(confirmationMessage)) {
      return;
    }

    startTransition(async () => {
      try {
        setMessage("");
        const response = await fetch(`/api/rounds/${round.id}`, {
          method: "DELETE"
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error ?? "Could not delete round.");
        }

        router.push("/current-round?deleted=1");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not delete round.");
      }
    });
  }

  function forceDeleteRound() {
    const confirmation = window.prompt(
      "Force clear this active round? This permanently deletes the unfinished round and all of its live scoring data. Type DELETE to confirm."
    );

    if (confirmation === null) {
      setMessage("Force clear dismissed.");
      return;
    }

    if (confirmation.trim().toLowerCase() !== "delete") {
      setMessage("Type delete to confirm force clear.");
      return;
    }

    startTransition(async () => {
      try {
        setMessage("");
        const response = await fetch(`/api/rounds/${round.id}?force=1`, {
          method: "DELETE"
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error ?? "Could not force clear round.");
        }

        setMessage("Active round cleared.");
        router.push("/current-round");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not force clear round.");
      }
    });
  }

  function saveRound(messageText = "Round saved.") {
    if (invalidSequence) {
      setMessage("Finish holes in order before saving.");
      setSaveFailed("Save failed. Finish holes in order first.");
      return;
    }

    startTransition(async () => {
      try {
        setSaving("Saving...");
        await persistRound();
        setSavedRows(rows.map((row) => ({ ...row, holeScores: [...row.holeScores] })));
        setMessage(messageText);
        setSaved("Saved");
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Could not save round.";
        setMessage(errorMessage);
        setSaveFailed(errorMessage);
      }
    });
  }

  function saveSettings() {
    saveRound("Round details saved.");
  }

  function archiveRound() {
    if (invalidSequence) {
      setMessage("Finish holes in order before archiving the round.");
      return;
    }

    if (!allBackSubmitted) {
      setMessage("Every team must submit final scores before you can archive this round.");
      return;
    }

    startTransition(async () => {
      try {
        setMessage("");
        setSaving("Saving round before quota review...");
        await persistRound();
        const nextSavedRows = rows.map((row) => ({ ...row, holeScores: [...row.holeScores] }));
        setSavedRows(nextSavedRows);

        const response = await fetch(`/api/rounds/${round.id}/complete`, {
          method: "GET"
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error ?? "Could not load quota adjustments.");
        }

        setQuotaAdjustmentError("");
        setQuotaAdjustmentPreview({
          warning:
            result.warning ??
            "Review carefully. These quotas will be used for the next round.",
          isTestRound: Boolean(result.isTestRound),
          readOnly: Boolean(result.readOnly),
          approvedAt: result.approvedAt ?? null,
          rows: Array.isArray(result.rows) ? result.rows : [],
          validation:
            result.validation && Array.isArray(result.validation.issues)
              ? {
                  totalPlayersChecked: Number(result.validation.totalPlayersChecked ?? 0),
                  totalRoundsChecked: Number(result.validation.totalRoundsChecked ?? 0),
                  mismatchCount: Number(result.validation.mismatchCount ?? 0),
                  issues: result.validation.issues
                }
              : { totalPlayersChecked: 0, totalRoundsChecked: 0, mismatchCount: 0, issues: [] }
        });
        setMessage(
          result.readOnly
            ? "Quota changes already approved for this round."
            : "Review quota changes before posting the round."
        );
        setSaved(result.readOnly ? "Quota changes already approved" : "Quota changes ready for review.");
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Could not load quota adjustments.";
        setMessage(errorMessage);
        setSaveFailed(errorMessage);
      }
    });
  }

  function closeQuotaAdjustmentPreview() {
    setQuotaAdjustmentError("");
    setQuotaAdjustmentPreview(null);
    setMessage("Returned to results without posting the round.");
  }

  function approveAndPostRound() {
    if (!quotaAdjustmentPreview) {
      return;
    }

    if (quotaAdjustmentPreview.readOnly) {
      setQuotaAdjustmentError("This round has already been approved and posted.");
      return;
    }

    const invalidPlayers = quotaAdjustmentPreview.rows.filter(
      (player) => player.startQuota + player.quotaAdjustment !== player.nextQuota
    );

    if (invalidPlayers.length > 0) {
      const errorMessage = `Quota approval blocked. Check: ${invalidPlayers
        .map((player) => player.playerName)
        .join(", ")}.`;
      setQuotaAdjustmentError(errorMessage);
      setMessage(errorMessage);
      setSaveFailed(errorMessage);
      return;
    }

    if (quotaAdjustmentPreview.validation.mismatchCount > 0) {
      const affectedPlayers = Array.from(
        new Set(quotaAdjustmentPreview.validation.issues.map((issue) => issue.playerName))
      );
      const errorMessage = `Quota approval blocked. Audit mismatches found for: ${affectedPlayers.join(", ")}.`;
      setQuotaAdjustmentError(errorMessage);
      setMessage(errorMessage);
      setSaveFailed(errorMessage);
      return;
    }

    startTransition(async () => {
      try {
        setQuotaAdjustmentError("");
        setMessage("");
        setSaving("Posting round and applying approved quota changes...");
        const response = await fetch(`/api/rounds/${round.id}/complete`, {
          method: "POST"
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error ?? "Could not archive round.");
        }

        setQuotaAdjustmentPreview(null);
        setMessage(
          quotaAdjustmentPreview.isTestRound
            ? "Test round archived. Player quotas were not updated."
            : "Round archived and quota changes approved."
        );
        setSaved(quotaAdjustmentPreview.isTestRound ? "Test round posted" : "Round posted");
        router.push("/past-games");
        router.refresh();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Could not archive round.";
        setMessage(errorMessage);
        setSaveFailed(errorMessage);
      }
    });
  }

  function startGame() {
    let count = 0;
    let nextRows: RowState[] = [];
    let now = "";

    try {
      count = isSkinsOnly ? 0 : selectedMatchFormat?.teamCount ?? 0;

      if (rows.length === 0) {
        setMessage("Add players before starting the game.");
        return;
      }
      if (!isSkinsOnly && (Number.isNaN(count) || count < 2 || count > teamOptions.length)) {
        setMessage("Choose a team format.");
        return;
      }
      if (!setupValidation.valid) {
        throw new Error(setupValidation.reason || "Finish assigning teams before starting.");
      }

      const playerNameById = new Map(calculatedRows.map((row) => [row.playerId, row.playerName]));
      const scoringGroupsForStart = isSkinsOnly
        ? []
        : buildScoringGroups(rows, teamStandings, playerNameById, initialGroups);
      const individualGroupsForStart = isSkinsOnly
        ? buildIndividualScoringGroups(rows, playersById, quotaSnapshot)
        : [];
      const groupNumberByTeam = new Map<TeamCode, number | null>();
      const teeTimeByTeam = new Map<TeamCode, string | null>();
      const groupNumberByPlayerId = new Map<string, number | null>();

      if (isSkinsOnly) {
        if (!individualGroupsForStart.length) {
          throw new Error("Could not build foursomes for this round.");
        }

        for (const group of individualGroupsForStart) {
          for (const playerId of group.playerIds) {
            groupNumberByPlayerId.set(playerId, group.groupNumber);
          }
        }
      } else {
        if (!scoringGroupsForStart.length) {
          throw new Error("Could not build playing groups for this round.");
        }

        for (const group of scoringGroupsForStart) {
          for (const team of group.teams) {
            groupNumberByTeam.set(team, group.groupNumber);
            teeTimeByTeam.set(team, group.teeTime);
          }
        }
      }

      nextRows = rows.map((row) => ({
        ...row,
        team: isSkinsOnly ? null : row.team,
        groupNumber: isSkinsOnly
          ? groupNumberByPlayerId.get(row.playerId) ?? row.groupNumber
          : row.team ? groupNumberByTeam.get(row.team) ?? row.groupNumber : null,
        teeTime: isSkinsOnly ? null : row.team ? teeTimeByTeam.get(row.team) ?? row.teeTime : null
      }));

      if (isSkinsOnly && nextRows.some((row) => row.groupNumber == null)) {
        throw new Error("Could not build foursomes for this round.");
      }

      if (!isSkinsOnly && nextRows.some((row) => row.team != null && row.groupNumber == null)) {
        throw new Error("Could not build playing groups for this round.");
      }
      now = new Date().toISOString();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not build teams for this round.");
      return;
    }

    startTransition(async () => {
      try {
        setMessage("");
        await persistRound(nextRows, now, now, String(count));
        setRows(nextRows);
        setSavedRows(nextRows.map((row) => ({ ...row, holeScores: [...row.holeScores] })));
        setLockedAt(now);
        setStartedAt(now);
        setSelectedTeam(null);
        setMessage(isSkinsOnly ? "Individual Quota + Skins is ready for scorecard entry." : "This round is ready for scorecard entry in Current Round.");
        router.push("/current-round");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not lock round.");
      }
    });
  }

  const teamRowsByCode = useMemo(() => {
    const map = new Map<TeamCode, CalculatedRoundRow[]>();
    for (const team of teamOptions) {
      map.set(
        team,
        calculatedRows.filter((row) => row.team === team)
      );
    }
    return map;
  }, [calculatedRows]);
  const orderedTeamStandings = useMemo(() => sortTeamsAlphabetically(teamStandings), [teamStandings]);
  const scoringGroups = useMemo(
    () =>
      buildScoringGroups(
        rows,
        teamStandings,
        new Map(calculatedRows.map((row) => [row.playerId, row.playerName])),
        initialGroups
      ),
    [calculatedRows, initialGroups, rows, teamStandings]
  );
  const selectedScoringGroup = useMemo(
    () =>
      selectedScoringGroupKey == null
        ? scoringGroups[0] ?? null
        : scoringGroups.find((group) => group.key === selectedScoringGroupKey) ?? scoringGroups[0] ?? null,
    [scoringGroups, selectedScoringGroupKey]
  );
  const visibleTeamCodes = useMemo(() => {
    if (isAdminCorrectionMode || selectedScoringGroup == null) {
      return new Set(orderedTeamStandings.map((team) => team.team));
    }

    return new Set(selectedScoringGroup.teams);
  }, [isAdminCorrectionMode, orderedTeamStandings, selectedScoringGroup]);
  const availableTeams = useMemo(
    () =>
      orderedTeamStandings
        .filter((team) => visibleTeamCodes.has(team.team))
        .map((team) => team.team),
    [orderedTeamStandings, visibleTeamCodes]
  );

  useEffect(() => {
    if (!scoringGroups.length) {
      if (selectedScoringGroupKey != null) {
        setSelectedScoringGroupKey(null);
      }
      return;
    }

    if (
      selectedScoringGroupKey == null ||
      !scoringGroups.some((group) => group.key === selectedScoringGroupKey)
    ) {
      setSelectedScoringGroupKey(scoringGroups[0].key);
    }
  }, [scoringGroups, selectedScoringGroupKey]);

  useEffect(() => {
    if (!selectedTeam || isAdminCorrectionMode) {
      return;
    }

    if (!visibleTeamCodes.has(selectedTeam)) {
      setSelectedTeam(null);
      setMessage("Switched scoring group. Choose one of the teams in this foursome.");
    }
  }, [isAdminCorrectionMode, selectedTeam, visibleTeamCodes]);

  function openTeam(team: TeamCode) {
    if (!isAdminCorrectionMode && !visibleTeamCodes.has(team)) {
      setMessage("That team belongs to another foursome. Use Admin Fix Scores only when you intentionally need to correct another group.");
      return;
    }

    const nextHole = getCheckpointAwareTeamHole(rows.filter((row) => row.team === team));
    setMessage("");
    setSelectedTeam(team);
    setActiveHoleByTeam((current) => ({
      ...current,
      [team]: nextHole
    }));
  }

  function enterAdminCorrectionMode() {
    const confirmed = window.confirm(
      "Admin Fix Scores lets you edit any team and any saved score.\n\nUse this only to correct mistakes for another foursome."
    );

    if (!confirmed) {
      return;
    }

    setIsAdminCorrectionMode(true);
    setMessage("Admin Fix Scores is on. You can now open any team to correct mistakes.");
  }

  function exitAdminCorrectionMode() {
    setIsAdminCorrectionMode(false);
    setMessage("Admin Fix Scores is off. Live scoring is limited to your selected foursome again.");
  }

  function getScoringGroupByTeam(team: TeamCode, sourceRows: RowState[] = rows) {
    return buildScoringGroups(
      sourceRows,
      teamStandings,
      new Map(calculatedRows.map((row) => [row.playerId, row.playerName])),
      initialGroups
    ).find((group) => group.teams.includes(team)) ?? null;
  }

  function getScoringGroupRows(team: TeamCode, sourceRows: RowState[] = rows) {
    const scoringGroup = getScoringGroupByTeam(team, sourceRows);
    const allowedTeams = new Set(scoringGroup?.teams ?? [team]);
    return sourceRows.filter((row) => row.team != null && allowedTeams.has(row.team));
  }

  function getOrderedCalculatedRowsForGroup(groupRows: RowState[]) {
    const calculatedRowsByPlayerId = new Map(calculatedRows.map((row) => [row.playerId, row]));
    return groupRows
      .map((row) => calculatedRowsByPlayerId.get(row.playerId) ?? null)
      .filter(Boolean) as CalculatedRoundRow[];
  }

  function getActiveHoleForGroup(team: TeamCode, sourceRows: RowState[] = rows) {
    const groupRows = getScoringGroupRows(team, sourceRows);
    if (!groupRows.length) {
      return 1;
    }

    const explicitHole = groupRows.reduce<number | null>((current, row) => {
      if (!row.team) {
        return current;
      }
      const teamHole = activeHoleByTeam[row.team];
      if (teamHole == null) {
        return current;
      }
      return current == null ? teamHole : Math.max(current, teamHole);
    }, null);

    return explicitHole ?? getCheckpointAwareTeamHole(groupRows);
  }

  function setActiveHoleForGroup(groupTeams: TeamCode[], hole: number) {
    setActiveHoleByTeam((current) => {
      const nextState = { ...current };
      const nextHole = Math.max(1, Math.min(18, hole));
      for (const groupTeam of groupTeams) {
        nextState[groupTeam] = nextHole;
      }
      return nextState;
    });
  }

  function openSkinsEntry() {
    const nextHole = getSuggestedHole(calculatedRows);
    setMessage("");
    setSkinsEntryOpen(true);
    setSkinsActiveHole(nextHole);
  }

  function setActiveHole(team: TeamCode, hole: number) {
    const teamRows = rows.filter((row) => row.team === team);
    const holeIndex = hole - 1;
    const targetRow = teamRows[0];

    if (
      targetRow &&
      isHoleLockedForRow(targetRow, holeIndex) &&
      !isScoreEditUnlocked
    ) {
      openLockedScorePrompt({ type: "select-hole", team, hole });
      return;
    }

    setActiveHoleByTeam((current) => ({
      ...current,
      [team]: Math.max(1, Math.min(18, hole))
    }));
  }

  function switchTeam(direction: -1 | 1) {
    if (!selectedTeam || !availableTeams.length) {
      return;
    }

    const currentIndex = availableTeams.indexOf(selectedTeam);
    if (currentIndex === -1) {
      return;
    }

    const nextIndex = (currentIndex + direction + availableTeams.length) % availableTeams.length;
    openTeam(availableTeams[nextIndex]);
  }

  function saveSkinsHole() {
    const holeNumber = skinsActiveHole;
    const holeIndex = holeNumber - 1;

    if (!calculatedRows.length) {
      setMessage("No players are in this skins game.");
      return;
    }

    if (calculatedRows.some((row) => row.holeScores[holeIndex] == null)) {
      setMessage(`Enter a score for every player on hole ${holeNumber}.`);
      return;
    }

    if (invalidSequence) {
      setMessage("Finish holes in order before saving.");
      setSaveFailed("Save failed. Finish holes in order first.");
      return;
    }

    if (holeNumber === 18) {
      startTransition(async () => {
        try {
          setSaving("Saving hole 18...");
          await persistRound();
          setSavedRows(rows.map((row) => ({ ...row, holeScores: [...row.holeScores] })));
          setSkinsEntryOpen(false);
          setToast("Hole 18 saved");
          setMessage("Hole 18 saved. Submit each player's back nine from the round status list.");
          setSaved("Hole 18 saved");
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Could not save skins scores.";
          setMessage(errorMessage);
          setSaveFailed(errorMessage);
        }
      });
      return;
    }

    const nextHole = Math.min(18, holeNumber + 1);

    startTransition(async () => {
      try {
        setSaving(`Saving hole ${holeNumber}...`);
        await persistRound();
        setSavedRows(rows.map((row) => ({ ...row, holeScores: [...row.holeScores] })));
        setSkinsActiveHole(nextHole);
        setToast("Hole saved");
        setMessage("");
        setSaved("Hole saved");
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Could not save skins scores.";
        setMessage(errorMessage);
        setSaveFailed(errorMessage);
      }
    });
  }

  function saveTeamHole(team: TeamCode) {
    const scoringGroup = getScoringGroupByTeam(team);
    const groupLabel = scoringGroup?.label ?? `Team ${team}`;
    const groupTeams = scoringGroup?.teams ?? [team];
    const workingRows = rows.map((row) => ({ ...row, holeScores: [...row.holeScores] }));
    const groupStateRows = getScoringGroupRows(team, workingRows);
    const groupCalculatedRows = getOrderedCalculatedRowsForGroup(groupStateRows);
    const holeNumber = getActiveHoleForGroup(team, groupStateRows);
    const holeIndex = holeNumber - 1;

    if (!groupCalculatedRows.length) {
      setMessage(`${groupLabel} has no players.`);
      return;
    }

    if (groupCalculatedRows.some((row) => row.holeScores[holeIndex] == null)) {
      setMessage(`Enter a score for every player in ${groupLabel} on hole ${holeNumber}.`);
      return;
    }

    if (invalidSequence) {
      setMessage("Finish holes in order before saving.");
      setSaveFailed("Save failed. Finish holes in order first.");
      return;
    }

    if (holeNumber === 9) {
      startTransition(async () => {
        try {
          setSaving("Saving hole 9...");
          await persistRound(workingRows);
          setSavedRows(workingRows.map((row) => ({ ...row, holeScores: [...row.holeScores] })));
          setToast("Hole 9 saved");
          setRows(workingRows);

          const shouldSubmit = window.confirm(
            "Submit Front Nine?\n\nPress OK to Submit Front 9 Score.\nPress Cancel to Review Scores."
          );

          if (shouldSubmit) {
            setSaving("Submitting front nine...");
            await submitScoringGroupSegment(team, "front", workingRows);
          } else {
            setMessage(
              `${groupLabel} front nine saved. Review scores, then tap Submit Front 9 Score when ready.`
            );
            setSaved("Hole 9 saved");
            setActiveHoleForGroup(groupTeams, 9);
            router.refresh();
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Could not save group scores.";
          setMessage(errorMessage);
          setSaveFailed(errorMessage);
        }
      });
      return;
    }

    if (holeNumber === 18) {
      startTransition(async () => {
        try {
          setSaving("Saving hole 18...");
          await persistRound(workingRows);
          setSavedRows(workingRows.map((row) => ({ ...row, holeScores: [...row.holeScores] })));
          setToast("Hole 18 saved");
          setRows(workingRows);

          const shouldSubmit = window.confirm(
            "Submit Final Score?\n\nPress OK to Submit Final Score.\nPress Cancel to Review Scores."
          );

          if (shouldSubmit) {
            setSaving("Submitting final score...");
            await submitScoringGroupSegment(team, "back", workingRows);
          } else {
            setMessage(`${groupLabel} final holes saved. Review scores, then tap save again to submit final score.`);
            setSaved("Hole 18 saved");
            setActiveHoleForGroup(groupTeams, 18);
            router.refresh();
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Could not save group scores.";
          setMessage(errorMessage);
          setSaveFailed(errorMessage);
        }
      });
      return;
    }

    const nextHole = Math.min(18, holeNumber + 1);

    startTransition(async () => {
      try {
        setSaving(`Saving hole ${holeNumber}...`);
        await persistRound(workingRows);
        setSavedRows(workingRows.map((row) => ({ ...row, holeScores: [...row.holeScores] })));
        setRows(workingRows);
        setActiveHoleForGroup(groupTeams, nextHole);
        setToast("Hole saved");
        setMessage("");
        setSaved("Hole saved");
        router.refresh();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Could not save group scores.";
        setMessage(errorMessage);
        setSaveFailed(errorMessage);
      }
    });
  }

  function goToPreviousHole(team: TeamCode) {
    const scoringGroup = getScoringGroupByTeam(team);
    const groupTeams = scoringGroup?.teams ?? [team];
    const currentHole = getActiveHoleForGroup(team);
    setActiveHoleForGroup(groupTeams, Math.max(1, currentHole - 1));
  }

  if (skinsEntryOpen && isSkinsOnly) {
    const canGoBack = skinsActiveHole > 1;
    const canSaveHole =
      calculatedRows.length > 0 &&
      calculatedRows.every((row) => row.holeScores[skinsActiveHole - 1] != null);

    return (
      <SkinsOnlyScoreEntry
        isTestRound={isTestRound}
        activeHole={skinsActiveHole}
        rows={calculatedRows}
        message={message}
        toast={toast}
        saveState={saveState}
        refreshState={refreshState}
        isPending={isPending}
        lastRefreshedAt={lastRefreshedAt}
        canGoBack={canGoBack}
        canSaveHole={canSaveHole}
        onUpdateHole={updateHole}
        onPreviousHole={() => setSkinsActiveHole((current) => Math.max(1, current - 1))}
        onSaveHole={saveSkinsHole}
        onSelectHole={(hole) => setSkinsActiveHole(Math.max(1, Math.min(18, hole)))}
        onBackToRound={() => setSkinsEntryOpen(false)}
        onRefresh={refreshRoundData}
      />
    );
  }

  if (selectedTeam) {
    const scoringGroup = getScoringGroupByTeam(selectedTeam);
    const groupRowStates = getScoringGroupRows(selectedTeam);
    const groupRows = getOrderedCalculatedRowsForGroup(groupRowStates);
    const activeHole = getActiveHoleForGroup(selectedTeam);
    const activeHoleIndex = activeHole - 1;
    const groupTeams = scoringGroup?.teams ?? [selectedTeam];
    const currentHoleLockState = groupRowStates.reduce(
      (state, row) => {
        if (row.backSubmittedAt) {
          return "final";
        }
        if (activeHoleIndex < 9 && row.frontSubmittedAt) {
          return state === "final" ? "final" : "front";
        }
        return state;
      },
      "none" as "none" | "front" | "final"
    );
    const canGoBack = activeHole > 1;
    const canSaveHole =
      groupRows.length > 0 && groupRows.every((row) => row.holeScores[activeHoleIndex] != null);

    return (
      <TeamScoreEntry
        team={selectedTeam}
        title={scoringGroup?.label ?? `Team ${selectedTeam}`}
        subtitle={groupTeams.map((teamCode) => `Team ${teamCode}`).join(" • ")}
        backButtonLabel="Back To Groups"
        isTestRound={isTestRound}
        activeHole={activeHole}
        rows={groupRows}
        teamStanding={null}
        message={message}
        toast={toast}
        saveState={saveState}
        refreshState={refreshState}
        isScoreEditUnlocked={isScoreEditUnlocked}
        currentHoleLockState={currentHoleLockState}
        isPending={isPending}
        lastSavedAt={lastSavedAt}
        lastRefreshedAt={lastRefreshedAt}
        canGoBack={canGoBack}
        canSaveHole={canSaveHole}
        onUpdateHole={updateHole}
        onPreviousHole={goToPreviousHole}
        onSaveHole={saveTeamHole}
        onSelectHole={setActiveHole}
        onBackToTeams={() => setSelectedTeam(null)}
        onRefresh={refreshRoundData}
      />
    );
  }

  return (
    <div className="space-y-3 pb-48">
      {!isLocked ? (
        <PageTitle
          title={round.completedAt ? "Round Review" : "Round Setup"}
          subtitle="Build the field, review the teams, then start this round when everything looks right."
          action={
            round.completedAt ? (
              <Link
                href={`/rounds/${round.id}/results`}
                className="rounded-2xl bg-pine px-4 py-3 text-sm font-semibold text-white"
              >
                Results
              </Link>
            ) : null
          }
        />
      ) : null}

      {!isLocked ? (
        <>
          <SectionCard className="space-y-3.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
                  Round Basics
                </p>
                <h3 className="mt-1 text-lg font-semibold">Game type</h3>
                <p className="mt-1 text-sm text-ink/65">
                  Choose the scoring format, then add players, build teams, and start the round.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <span className="block text-sm font-semibold">Game mode</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={classNames(
                    "min-h-12 rounded-2xl border px-4 text-sm font-semibold",
                    !isSkinsOnly ? "border-pine bg-pine text-white" : "border-ink/10 bg-canvas text-ink"
                  )}
                  onClick={() => {
                    setGameMode("MATCH_QUOTA");
                    setScoringEntryMode("QUICK");
                    setRows([]);
                    setSavedRows([]);
                    setSearch("");
                    setSetupTeamCount(null);
                    setSetupFormatKey(null);
                    setTeamBuildVariant(0);
                    setMessage("");
                  }}
                >
                  Match + Quota
                </button>
                <button
                  type="button"
                  className={classNames(
                    "min-h-12 rounded-2xl border px-4 text-sm font-semibold",
                    isSkinsOnly ? "border-pine bg-pine text-white" : "border-ink/10 bg-canvas text-ink"
                  )}
                  onClick={() => {
                    setGameMode("SKINS_ONLY");
                    setScoringEntryMode("QUICK");
                    setRows([]);
                    setSavedRows([]);
                    setSearch("");
                    setSetupTeamCount(null);
                    setSetupFormatKey(null);
                    setTeamBuildVariant(0);
                    setMessage("");
                  }}
                >
                  Individual Quota + Skins
                </button>
              </div>
            </div>
          </SectionCard>

          <>
              <SectionCard className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Step 1</p>
                    <h3 className="mt-1 text-lg font-semibold">Add players</h3>
                    <p className="mt-1 text-sm text-ink/65">Select everyone playing today.</p>
                  </div>
                  <span className="rounded-full bg-[#E2F4E6] px-3 py-1.5 text-xs font-semibold text-pine">
                    {`Players selected: ${rows.length}`}
                  </span>
                </div>
                <input
                  className="h-14 w-full rounded-2xl border border-ink/10 bg-canvas px-4 text-base outline-none"
                  placeholder="Search players"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {filteredPlayers.map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      className="flex min-h-16 w-full items-center justify-between rounded-[22px] bg-canvas px-4 text-left"
                      onClick={() => addPlayer(player.id)}
                    >
                      <span>
                        <span className="block text-base font-semibold">{player.name}</span>
                        <span className="mt-1 block text-sm text-ink/55">
                          {`Quota ${quotaSnapshot[player.id] ?? player.quota}`}
                        </span>
                      </span>
                      <span className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-pine">
                        Add
                      </span>
                    </button>
                  ))}
                </div>
                {rows.length ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-ink">Selected players</p>
                    <div className="space-y-2">
                      {rows.map((row) => {
                        const player = playersById.get(row.playerId);
                        return (
                          <div
                            key={`selected-${row.playerId}`}
                            className="flex items-center justify-between gap-3 rounded-2xl bg-canvas px-4 py-3"
                          >
                            <div>
                              <p className="text-base font-semibold text-ink">
                                {player?.name ?? "Unknown Player"}
                              </p>
                              <p className="mt-1 text-xs text-ink/55">
                                {`Quota ${player ? quotaSnapshot[row.playerId] ?? player.quota : 0}`}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="min-h-10 rounded-full bg-white px-3 text-xs font-semibold text-ink/70"
                              onClick={() => removePlayer(row.playerId)}
                            >
                              Remove
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </SectionCard>

              {!isSkinsOnly ? (
                <>
                  <SectionCard className="space-y-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Step 2</p>
                      <h3 className="mt-1 text-lg font-semibold">Choose team format</h3>
                      <p className="mt-1 text-sm text-ink/65">Select the actual format of play for this round.</p>
                    </div>
                      {matchSetupPlayerCount == null ? (
                        <div className="rounded-2xl border border-ink/10 bg-canvas px-4 py-3 text-sm text-ink/60">
                          Select players first.
                        </div>
                      ) : !availableMatchFormats.length ? (
                        <div className="rounded-2xl border border-danger/15 bg-danger/5 px-4 py-3 text-sm text-danger">
                          {`No valid team format for ${matchSetupPlayerCount} players. For Match + Quota, use 4, 6, 8, 10, 12, 14, or 16 players.`}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {availableMatchFormats.map((format) => {
                          const selected = getTeamFormatKey(format) === setupFormatKey;
                          return (
                            <button
                              key={`format-${getTeamFormatKey(format)}`}
                              type="button"
                              className={classNames(
                                "min-h-16 rounded-[22px] border px-4 py-3 text-left transition",
                                selected
                                  ? "border-pine bg-pine text-white"
                                  : "border-ink/10 bg-canvas text-ink"
                              )}
                              onClick={() => {
                                setSetupTeamCount(format.teamCount);
                                setSetupFormatKey(getTeamFormatKey(format));
                                setTeamBuildVariant(0);
                                setRows((current) =>
                                  current.map((row) => ({
                                    ...row,
                                    team: null,
                                    groupNumber: null,
                                    teeTime: null
                                  }))
                                );
                                setSavedRows((current) =>
                                  current.map((row) => ({
                                    ...row,
                                    team: null,
                                    groupNumber: null,
                                    teeTime: null
                                  }))
                                );
                                setMessage("");
                              }}
                              >
                                <span className="block text-base font-semibold">
                                  {format.label}
                                </span>
                                {format.subtitle ? (
                                  <span className={classNames(
                                    "mt-1 block text-xs font-medium uppercase tracking-[0.14em]",
                                    selected ? "text-white/75" : "text-ink/55"
                                  )}>
                                    {format.subtitle}
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                      </div>
                    )}
                  </SectionCard>

                  <SectionCard className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Step 3</p>
                        <h3 className="mt-1 text-lg font-semibold">Build teams</h3>
                        <p className="mt-1 text-sm text-ink/65">
                          Auto-build balanced teams from player quotas, then review the totals.
                        </p>
                        {selectedMatchFormat ? (
                          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-pine">
                            {`Selected format: ${selectedMatchFormat.label}${selectedMatchFormat.subtitle ? ` (${selectedMatchFormat.subtitle})` : ""}`}
                          </p>
                        ) : null}
                      </div>
                      {hasAutoBuiltTeams ? (
                        <div className="rounded-2xl bg-canvas px-4 py-3 text-center">
                          <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Quota Spread</p>
                          <p className="mt-1 text-xl font-semibold">{teamQuotaSpread}</p>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!selectedMatchFormat || rows.length === 0}
                        className="min-h-12 flex-1 rounded-full bg-pine px-4 text-sm font-semibold text-white disabled:opacity-60"
                        onClick={() => autoBuildMatchQuotaTeams(false)}
                      >
                        Auto-Build Balanced Teams
                      </button>
                      <button
                        type="button"
                        disabled={!selectedMatchFormat || !hasAutoBuiltTeams}
                        className="min-h-12 flex-1 rounded-full bg-canvas px-4 text-sm font-semibold text-ink disabled:opacity-60"
                        onClick={() => autoBuildMatchQuotaTeams(true)}
                      >
                        Rebuild Teams
                      </button>
                      <button
                        type="button"
                        disabled={!hasAutoBuiltTeams}
                        className="min-h-12 flex-1 rounded-full bg-white px-4 text-sm font-semibold text-ink disabled:opacity-60"
                        onClick={() => setIsSetupTeamEditMode((current) => !current)}
                      >
                        {isSetupTeamEditMode ? "Done Editing" : "Edit Teams"}
                      </button>
                    </div>
                    {hasAutoBuiltTeams ? (
                      <div className="grid gap-2">
                        {setupTeams.map((team) => (
                          <div key={`review-${team.team}`} className="rounded-2xl border border-ink/10 bg-canvas px-3 py-2.5">
                            <p className="truncate text-[15px] font-semibold leading-snug text-ink">
                              {`${getSetupTeamLabel(team.team)} (${team.totalQuota}): ${team.players.map((player) => `${player.playerName} ${player.quota}`).join(" | ")}`}
                            </p>
                            {isSetupTeamEditMode ? (
                              <div className="mt-2 space-y-2">
                                {team.players.map((player) => (
                                  <div key={`review-player-${player.playerId}`} className="rounded-2xl bg-white px-3 py-2">
                                    <p className="text-sm font-semibold text-ink">{`${player.playerName} (${player.quota})`}</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {setupTeamCodes.map((destinationTeam) => (
                                        <button
                                          key={`move-${player.playerId}-${destinationTeam}`}
                                          type="button"
                                          className={classNames(
                                            "min-h-9 rounded-full px-3 text-xs font-semibold",
                                            destinationTeam === team.team
                                              ? "bg-pine text-white"
                                              : "bg-canvas text-ink/75"
                                          )}
                                          onClick={() => assignSetupPlayer(player.playerId, destinationTeam)}
                                        >
                                          {getSetupTeamLabel(destinationTeam).replace("Team ", "T")}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-ink/10 bg-canvas px-4 py-3 text-sm text-ink/60">
                        {hasSupportedMatchFormat
                          ? "Choose the supported format, then auto-build the teams."
                          : "Select a supported player count to build teams."}
                      </div>
                    )}
                  </SectionCard>

                  <SectionCard className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Step 4</p>
                          <h3 className="mt-1 text-lg font-semibold">Assign playing groups</h3>
                          <p className="mt-1 text-sm text-ink/65">
                            Build the foursomes that will actually score together on the course.
                          </p>
                        </div>
                        {hasAssignedScoringGroups ? (
                          <span className="rounded-full bg-[#E2F4E6] px-3 py-1.5 text-xs font-semibold text-pine">
                            Ready
                          </span>
                        ) : null}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          disabled={!hasAutoBuiltTeams}
                          className="min-h-12 rounded-full bg-canvas px-4 text-sm font-semibold text-ink disabled:opacity-60"
                          onClick={autoAssignScoringGroups}
                        >
                          {hasAssignedScoringGroups ? "Rebuild Foursomes" : "Build Foursomes"}
                        </button>
                        <button
                          type="button"
                          disabled={!groupChatText}
                          className="min-h-12 rounded-full bg-pine px-4 text-sm font-semibold text-white disabled:opacity-60"
                          onClick={copyTeamsForGroupChat}
                        >
                          Copy Teams for Group Chat
                        </button>
                      </div>
                      {toast === "Copied to clipboard" ? (
                        <p className="rounded-2xl bg-[#E2F4E6] px-4 py-2 text-sm font-semibold text-pine">Copied to clipboard</p>
                      ) : null}
                      {setupScoringGroupsPreview.length ? (
                        <div className="grid gap-3">
                          {setupScoringGroupsPreview.map((group) => (
                            <div key={group.key} className="rounded-2xl bg-canvas px-4 py-4">
                              <p className="text-base font-semibold text-ink">{group.label}</p>
                              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink/55">
                                {group.teams.map((team) => `Team ${team}`).join(" \u2022 ")}
                              </p>
                              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl bg-white px-4 py-3">
                                {rows
                                  .filter((row) => row.team != null && group.teams.includes(row.team))
                                  .sort((a, b) => {
                                    const playerA = playersById.get(a.playerId);
                                    const playerB = playersById.get(b.playerId);
                                    const quotaA = playerA ? quotaSnapshot[a.playerId] ?? playerA.quota : 0;
                                    const quotaB = playerB ? quotaSnapshot[b.playerId] ?? playerB.quota : 0;
                                    return quotaB - quotaA;
                                  })
                                  .map((row, playerIndex) => {
                                    const player = playersById.get(row.playerId);
                                    const quota = player ? quotaSnapshot[row.playerId] ?? player.quota : 0;
                                    return (
                                      <div
                                        key={`group-${group.key}-${row.playerId}`}
                                        className={classNames("min-w-0", playerIndex % 2 === 1 ? "text-right" : "text-left")}
                                      >
                                        <p className="truncate text-sm font-semibold text-ink">
                                          {player?.name ?? "Unknown Player"}
                                          <span className="ml-1 text-xs font-semibold text-ink/45">{`(${quota})`}</span>
                                          {row.team ? <span className="ml-1 text-xs font-semibold text-ink/45">{`(${row.team})`}</span> : null}
                                        </p>
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-ink/10 bg-canvas px-4 py-3 text-sm text-ink/60">
                          Build teams first, then assign the foursomes that will score together.
                        </div>
                      )}
                    </SectionCard>

                    <SectionCard className="space-y-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Step 5</p>
                      <h3 className="mt-1 text-lg font-semibold">Start round</h3>
                      <p className="mt-1 text-sm text-ink/65">
                        Lock setup and move this round into Current Round for scorecard entry.
                      </p>
                    </div>
                    {message ? <p className="text-sm font-medium text-pine">{message}</p> : null}
                    {!setupValidation.valid && (rows.length > 0 || setupTeamCount != null) ? (
                      <p className="text-sm font-medium text-[#A53B2A]">
                        {setupValidation.reason || "Finish setup before starting the round."}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      disabled={isPending || !canStartConfiguredRound || !hasAutoBuiltTeams}
                      className="min-h-14 w-full rounded-[24px] bg-ink px-5 text-base font-semibold text-white disabled:opacity-60"
                      onClick={startGame}
                    >
                      {isPending ? "Starting round..." : "Start Round"}
                    </button>
                  </SectionCard>
                </>
              ) : (
                <>
                  <SectionCard className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Step 2</p>
                        <h3 className="mt-1 text-lg font-semibold">Build foursomes</h3>
                        <p className="mt-1 text-sm text-ink/65">
                          No team match. Build balanced foursomes for score entry using player quotas.
                        </p>
                      </div>
                      {hasAssignedScoringGroups ? (
                        <span className="rounded-full bg-[#E2F4E6] px-3 py-1.5 text-xs font-semibold text-pine">
                          Ready
                        </span>
                      ) : null}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        disabled={!rows.length}
                        className="min-h-12 rounded-full bg-canvas px-4 text-sm font-semibold text-ink disabled:opacity-60"
                        onClick={autoAssignIndividualScoringGroups}
                      >
                        {hasAssignedScoringGroups ? "Rebuild Foursomes" : "Build Foursomes"}
                      </button>
                      <button
                        type="button"
                        disabled={!groupChatText}
                        className="min-h-12 rounded-full bg-pine px-4 text-sm font-semibold text-white disabled:opacity-60"
                        onClick={copyTeamsForGroupChat}
                      >
                        Copy Teams for Group Chat
                      </button>
                    </div>
                    {toast === "Copied to clipboard" ? (
                      <p className="rounded-2xl bg-[#E2F4E6] px-4 py-2 text-sm font-semibold text-pine">Copied to clipboard</p>
                    ) : null}
                    {individualScoringGroupsPreview.length ? (
                      <div className="grid gap-3">
                        {individualScoringGroupsPreview.map((group) => (
                          <div key={group.key} className="rounded-2xl bg-canvas px-4 py-4">
                            <p className="text-base font-semibold text-ink">{group.label}</p>
                            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl bg-white px-4 py-3">
                              {[...group.playerIds].sort((a, b) => {
                                const playerA = playersById.get(a);
                                const playerB = playersById.get(b);
                                const quotaA = playerA ? quotaSnapshot[a] ?? playerA.quota : 0;
                                const quotaB = playerB ? quotaSnapshot[b] ?? playerB.quota : 0;
                                return quotaB - quotaA;
                              }).map((playerId, playerIndex) => {
                                const player = playersById.get(playerId);
                                const quota = player ? quotaSnapshot[playerId] ?? player.quota : 0;
                                return (
                                  <div
                                    key={`individual-group-${group.key}-${playerId}`}
                                    className={classNames("min-w-0", playerIndex % 2 === 1 ? "text-right" : "text-left")}
                                  >
                                    <p className="truncate text-sm font-semibold text-ink">
                                      {player?.name ?? "Unknown Player"}
                                      <span className="ml-1 text-xs font-semibold text-ink/45">{`(${quota})`}</span>
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-ink/10 bg-canvas px-4 py-3 text-sm text-ink/60">
                        Add players, then build balanced foursomes.
                      </div>
                    )}
                  </SectionCard>

                  <SectionCard className="space-y-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Step 3</p>
                      <h3 className="mt-1 text-lg font-semibold">Start round</h3>
                      <p className="mt-1 text-sm text-ink/65">
                        Move this Individual Quota + Skins round into Current Round for scorecard entry.
                      </p>
                    </div>
                    {message ? <p className="text-sm font-medium text-pine">{message}</p> : null}
                    {!setupValidation.valid && rows.length > 0 ? (
                      <p className="text-sm font-medium text-[#A53B2A]">
                        {setupValidation.reason || "Finish setup before starting the round."}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      disabled={isPending || !canStartConfiguredRound}
                      className="min-h-14 w-full rounded-[24px] bg-ink px-5 text-base font-semibold text-white disabled:opacity-60"
                      onClick={startGame}
                    >
                      {isPending ? "Starting round..." : "Start Round"}
                    </button>
                  </SectionCard>
                </>
              )}

              <SectionCard className="space-y-3">
                <button
                  type="button"
                  disabled={isPending}
                  className="min-h-12 w-full rounded-2xl bg-danger/12 px-4 text-sm font-semibold text-danger disabled:opacity-60"
                  onClick={deleteRound}
                >
                  Delete Round
                </button>
              </SectionCard>
            </>
        </>
      ) : isQuickEntryMode ? (
        <QuickEntryRoundView
          rows={quickEntryRows}
          saveState={saveState}
          lastSavedAt={lastSavedAt}
          refreshState={refreshState}
          lastRefreshedAt={lastRefreshedAt}
          isArchiving={isPending}
          allEntriesComplete={allBackSubmitted}
          onFrontNineChange={updateQuickFrontNine}
          onBackNineChange={updateQuickBackNine}
          isIndividualQuotaSkins={isSkinsOnly}
          onBirdieHolesChange={updateQuickBirdieHoles}
          onSaveRound={() => saveRound("Scorecard saved.")}
          onArchiveRound={archiveRound}
          onRefresh={refreshRoundData}
        />
      ) : isSkinsOnly ? (
        <SkinsOnlyRoundView
          rows={calculatedRows}
          rowStates={rows}
          isTestRound={isTestRound}
          saveState={saveState}
          lastSavedAt={lastSavedAt}
          refreshState={refreshState}
          lastRefreshedAt={lastRefreshedAt}
          onOpenEntry={openSkinsEntry}
          onRefresh={refreshRoundData}
        />
      ) : (
        <MatchRoundView
          rows={calculatedRows}
          rowStates={rows}
          roundName={round.roundName}
          teamStandings={teamStandings}
          teamRowsByCode={teamRowsByCode}
          scoringGroups={scoringGroups}
          selectedScoringGroupKey={selectedScoringGroup?.key ?? null}
          visibleTeamCodes={visibleTeamCodes}
          isAdminCorrectionMode={isAdminCorrectionMode}
          sideGames={sideGames}
          payoutSummary={payoutSummary}
          isTestRound={isTestRound}
          saveState={saveState}
          lastSavedAt={lastSavedAt}
          refreshState={refreshState}
          lastRefreshedAt={lastRefreshedAt}
          isArchiving={isPending}
          onArchiveRound={archiveRound}
          onOpenTeam={openTeam}
          onSelectScoringGroup={setSelectedScoringGroupKey}
          onEnterAdminCorrectionMode={enterAdminCorrectionMode}
          onExitAdminCorrectionMode={exitAdminCorrectionMode}
          onRefresh={refreshRoundData}
        />
      )}

      {quotaAdjustmentPreview ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-hero text-ink">
          <div
            className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-3.5 pb-8 sm:px-4"
            style={{
              paddingTop: "max(24px, calc(env(safe-area-inset-top) + 16px))",
              paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))"
            }}
          >
            <PageTitle
              title="Confirm Quota Changes"
              subtitle="Review carefully. These quotas will be used for the next round."
            />

            <div className="space-y-3 pb-4">
              <SectionCard className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
                    Quota Confirmation
                  </p>
                  <p className="mt-1 text-sm text-ink/70">{quotaAdjustmentPreview.warning}</p>
                  {quotaAdjustmentPreview.readOnly && quotaAdjustmentPreview.approvedAt ? (
                    <p className="mt-2 text-sm font-semibold text-pine">
                      {`Already approved on ${new Date(quotaAdjustmentPreview.approvedAt).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit"
                      })}.`}
                    </p>
                  ) : null}
                </div>

                {quotaAdjustmentPreview.validation.mismatchCount > 0 ? (
                  <div className="rounded-[22px] bg-[#FCE5E2] px-4 py-3 text-sm text-danger">
                    <p className="font-semibold">
                      {`${quotaAdjustmentPreview.validation.mismatchCount} quota mismatch${quotaAdjustmentPreview.validation.mismatchCount === 1 ? "" : "es"} found across ${quotaAdjustmentPreview.validation.totalPlayersChecked} players.`}
                    </p>
                    <div className="mt-3 space-y-2">
                      {quotaAdjustmentPreview.validation.issues.map((issue, index) => (
                        <div key={`${issue.playerId}-${issue.roundId ?? "current"}-${issue.fieldLabel}-${index}`} className="rounded-2xl bg-white/80 px-3 py-3 text-sm text-ink/80">
                          <p className="font-semibold text-ink">{issue.playerName}</p>
                          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-danger/80">{issue.roundLabel}</p>
                          <p className="mt-1">{issue.fieldLabel}</p>
                          <p className="mt-1 text-danger">{`Expected ${issue.expected}, found ${issue.actual}.`}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {quotaAdjustmentError ? (
                  <div className="rounded-[22px] bg-[#FCE5E2] px-4 py-3 text-sm font-medium text-danger">
                    {quotaAdjustmentError}
                  </div>
                ) : null}
              </SectionCard>

              <div className="space-y-3">
                {quotaAdjustmentPreview.rows.map((player) => (
                  <SectionCard key={player.playerId} className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-ink">{player.playerName}</p>
                        <p className="mt-1 text-sm text-ink/60">{`Points scored: ${player.totalPoints}`}</p>
                      </div>
                      <div className="rounded-2xl bg-canvas px-3 py-2 text-right">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">New quota</p>
                        <p className="mt-1 text-lg font-semibold text-ink">{player.nextQuota}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-2xl bg-canvas px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Starting quota</p>
                        <p className="mt-1 font-semibold text-ink">{player.startQuota}</p>
                      </div>
                      <div className="rounded-2xl bg-canvas px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Points scored</p>
                        <p className="mt-1 font-semibold text-ink">{player.totalPoints}</p>
                      </div>
                      <div className="rounded-2xl bg-canvas px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Quota adjustment</p>
                        <p
                          className={classNames(
                            "mt-1 font-semibold",
                            player.quotaAdjustment > 0
                              ? "text-pine"
                              : player.quotaAdjustment < 0
                                ? "text-danger"
                                : "text-ink"
                          )}
                        >
                          {formatPlusMinus(player.quotaAdjustment)}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-canvas px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Math check</p>
                        <p className="mt-1 font-semibold text-ink">
                          {`${player.startQuota} ${player.quotaAdjustment >= 0 ? "+" : "-"} ${Math.abs(player.quotaAdjustment)} = ${player.nextQuota}`}
                        </p>
                      </div>
                    </div>
                  </SectionCard>
                ))}
              </div>

              <SectionCard className="space-y-3">
                <p className="text-sm text-ink/70">
                  Once approved, these quotas become the starting quotas for the next round.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="min-h-12 rounded-2xl border border-ink/10 bg-canvas px-4 text-sm font-semibold text-ink disabled:opacity-45"
                    onClick={closeQuotaAdjustmentPreview}
                    disabled={isPending}
                  >
                    Back to Results
                  </button>
                  <button
                    type="button"
                    className="club-btn-primary min-h-12 disabled:opacity-45"
                    onClick={approveAndPostRound}
                    disabled={isPending || quotaAdjustmentPreview.readOnly || quotaAdjustmentPreview.validation.mismatchCount > 0}
                  >
                    {quotaAdjustmentPreview.readOnly
                      ? "Already Posted"
                      : isPending
                        ? "Posting Round..."
                        : "Approve & Post Round"}
                  </button>
                </div>
              </SectionCard>
            </div>
          </div>
        </div>
      ) : null}


      {isScoreUnlockOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-ink/35 p-3 sm:items-center sm:justify-center">
          <SectionCard className="w-full max-w-md space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
                Submitted Scores Locked
              </p>
              <h3 className="mt-1 text-xl font-semibold">Password required</h3>
              <p className="mt-1 text-sm text-ink/65">
                Front-nine and final submitted scores stay locked unless the admin password is entered.
              </p>
            </div>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">Password</span>
              <input
                type="password"
                value={scoreUnlockPassword}
                onChange={(event) => setScoreUnlockPassword(event.target.value)}
                className="h-14 w-full rounded-2xl border border-ink/10 bg-canvas px-4 text-base outline-none"
                autoFocus
              />
            </label>
            {scoreUnlockMessage ? (
              <p className="text-sm font-medium text-danger">{scoreUnlockMessage}</p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="min-h-12 rounded-2xl border border-ink/10 bg-canvas px-4 text-sm font-semibold text-ink"
                onClick={() => {
                  setIsScoreUnlockOpen(false);
                  setPendingLockedScoreAction(null);
                  setScoreUnlockPassword("");
                  setScoreUnlockMessage("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="club-btn-primary min-h-12"
                onClick={unlockSubmittedScoreEditing}
              >
                Unlock Editing
              </button>
            </div>
          </SectionCard>
        </div>
      ) : null}
    </div>
  );
}

function TeamScoreEntry({
  team,
  title,
  subtitle,
  backButtonLabel,
  isTestRound,
  activeHole,
  rows,
  teamStanding,
  message,
  toast,
  saveState,
  refreshState,
  isScoreEditUnlocked,
  currentHoleLockState,
  isPending,
  lastSavedAt,
  lastRefreshedAt,
  canGoBack,
  canSaveHole,
  onUpdateHole,
  onPreviousHole,
  onSaveHole,
  onSelectHole,
  onBackToTeams,
  onRefresh
}: {
  team: TeamCode;
  title: string;
  subtitle: string;
  backButtonLabel: string;
  isTestRound: boolean;
  activeHole: number;
  rows: CalculatedRoundRow[];
  teamStanding: TeamStanding | null;
  message: string;
  toast: string;
  saveState: SaveState;
  refreshState: SaveState;
  isScoreEditUnlocked: boolean;
  currentHoleLockState: "none" | "front" | "final";
  isPending: boolean;
  lastSavedAt: string | null;
  lastRefreshedAt: string | null;
  canGoBack: boolean;
  canSaveHole: boolean;
  onUpdateHole: (playerId: string, holeIndex: number, value: number | null) => void;
  onPreviousHole: (team: TeamCode) => void;
  onSaveHole: (team: TeamCode) => void;
  onSelectHole: (team: TeamCode, hole: number) => void;
  onBackToTeams: () => void;
  onRefresh: () => void;
}) {
  function handleHoleButtonClick(holeNumber: number) {
    onSelectHole(team, holeNumber);
  }

  const activeHoleIndex = activeHole - 1;
  const isFinalHole = activeHole === 18;
  const lastSavedLabel = formatTimeLabel(lastSavedAt);
  const lastRefreshedLabel = formatTimeLabel(lastRefreshedAt);
  const holeLocked = currentHoleLockState !== "none" && !isScoreEditUnlocked;
  const teamFrontCompletedHoles = countCompletedSegmentHoles(rows, 0, 9);
  const teamBackCompletedHoles = countCompletedSegmentHoles(rows, 9, 18);
  const teamTotalCompletedHoles = countCompletedSegmentHoles(rows, 0, 18);
  const backNineInPlay = activeHole > 9 || currentHoleLockState === "final";
  const teamGoalItems = teamStanding
    ? [
        buildPaceStatus({
          label: "Front",
          actualPoints: teamStanding.frontPoints,
          goal: teamStanding.frontQuota,
          holesCompleted: teamFrontCompletedHoles,
          segmentHoleCount: 9,
          started: teamFrontCompletedHoles > 0
        }),
        buildPaceStatus({
          label: "Back",
          actualPoints: teamStanding.backPoints,
          goal: teamStanding.backQuota,
          holesCompleted: teamBackCompletedHoles,
          segmentHoleCount: 9,
          started: backNineInPlay
        }),
        buildPaceStatus({
          label: "Total",
          actualPoints: teamStanding.totalPoints,
          goal: teamStanding.totalQuota,
          holesCompleted: teamTotalCompletedHoles,
          segmentHoleCount: 18,
          started: teamTotalCompletedHoles > 0
        })
      ]
    : [];
  const holeStripRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const strip = holeStripRef.current;
    if (!strip) return;

    const activeButton = strip.querySelector<HTMLButtonElement>(
      `[data-hole="${activeHole}"]`
    );
    if (!activeButton) return;

    activeButton.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center"
    });

    const frame = window.requestAnimationFrame(() => {
      const stripRect = strip.getBoundingClientRect();
      const buttonRect = activeButton.getBoundingClientRect();
      const currentScroll = strip.scrollLeft;
      const targetScroll =
        currentScroll + (buttonRect.left - stripRect.left) - stripRect.width / 2 + buttonRect.width / 2;

      strip.scrollTo({
        left: Math.max(0, targetScroll),
        behavior: "smooth"
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeHole]);

  return (
    <div className="space-y-3 pb-28">
      <SectionCard className="sticky top-2 z-20 space-y-2.5 border-white/70 bg-white/95 py-3 shadow-lg backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Live Scoring</p>
            <h2 className="mt-1 text-xl font-semibold">{title}</h2>`r`n            <p className="mt-1 text-sm text-ink/65">{subtitle}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white">
                {`Hole ${activeHole} of 18`}
              </span>
              {isTestRound ? <TestRoundBadge subtle /> : null}
              {saveState.tone === "failed" && saveState.message ? (
                <span className={classNames("rounded-full px-3 py-1.5 text-xs font-semibold", getSaveToneClass(saveState.tone))}>
                  {saveState.message}
                </span>
              ) : null}
              {lastSavedLabel && saveState.tone === "saved" ? (
                <span className="rounded-full bg-canvas px-3 py-1.5 text-xs font-semibold text-ink/70">
                  {`Saved ${lastSavedLabel}`}
                </span>
              ) : null}
            </div>
            {currentHoleLockState !== "none" ? (
              <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#FFF1BF] px-3 py-1.5 text-xs font-semibold text-ink">
                <span aria-hidden="true">Locked</span>
                <span>
                  {currentHoleLockState === "final"
                    ? "Final Submitted"
                    : "Front 9 Submitted"}
                </span>
              </div>
            ) : null}
            {holeLocked ? (
              <p className="mt-2 text-xs font-semibold text-ink/60">
                Submitted scores require the password to edit.
              </p>
            ) : null}
          </div>
          <div className="rounded-[22px] bg-ink px-3 py-2.5 text-right text-white">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/55">Current Hole</p>
            <p className="mt-1 text-[2rem] font-semibold leading-none">{activeHole}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onRefresh}
            className="min-h-11 rounded-2xl bg-canvas px-4 py-2.5 text-sm font-semibold text-ink"
          >
            {refreshState.tone === "saving" ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            onClick={onBackToTeams}
            className="min-h-11 rounded-2xl bg-canvas px-4 py-2.5 text-sm font-semibold text-ink"
          >
            {backButtonLabel}
          </button>
          {refreshState.tone === "failed" && refreshState.message ? (
            <span className="text-xs font-semibold text-danger">{refreshState.message}</span>
          ) : null}
        </div>
        <div
          ref={holeStripRef}
          className="flex gap-1.5 overflow-x-auto px-1 pb-1 pt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {holeNumbers.map((holeNumber) => (
            <button
              key={holeNumber}
              data-hole={holeNumber}
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleHoleButtonClick(holeNumber);
              }}
              className={classNames(
                "touch-manipulation min-h-[3rem] rounded-[18px] px-3 text-sm font-semibold transition-all duration-200",
                holeNumber === activeHole
                  ? "min-w-[4rem] scale-[1.04] bg-ink px-4 text-base text-white shadow-card"
                  : "min-w-[3rem] bg-canvas text-ink/70"
              )}
            >
              {holeNumber}
            </button>
          ))}
        </div>
      </SectionCard>

      <div className="relative z-10 space-y-2">
        {rows.map((row) => {
          const currentScore = row.holeScores[activeHoleIndex];
          const completedHoles = countCompletedPlayerHoles(row.holeScores);
          const progressTone = getPlayerQuotaProgressTone(
            row.totalPoints,
            row.startQuota,
            completedHoles
          );

          return (
            <div key={row.playerId} className="rounded-[20px] border border-ink/10 bg-white px-3 py-2.5 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold leading-tight text-ink">{row.playerName}</p>
                  <p className={classNames("mt-0.5 text-xs font-semibold leading-none", progressTone)}>
                    {`${row.totalPoints} / ${row.startQuota}`}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-canvas px-2 py-1 text-xs font-semibold text-ink/75">
                  {currentScore ?? "-"}
                </span>
              </div>
              <ScoreButtonGroup
                compact
                value={row.holeScores[activeHoleIndex]}
                onSelect={(value) => onUpdateHole(row.playerId, activeHoleIndex, value)}
              />
            </div>
          );
        })}
      </div>

      <div
        className="fixed left-1/2 z-30 w-[calc(100%-1rem)] max-w-md -translate-x-1/2 rounded-[26px] border border-white/80 bg-white/96 p-2.5 shadow-card backdrop-blur"
        style={{
          bottom: "calc(5.5rem + env(safe-area-inset-bottom))"
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onPreviousHole(team)} disabled={isPending || !canGoBack} className="min-h-[3.35rem] rounded-[20px] border border-ink/10 bg-canvas px-4 text-sm font-semibold text-ink disabled:opacity-45">
            Previous Hole
          </button>
            <button type="button" onClick={() => onSaveHole(team)} disabled={isPending || !canSaveHole} className="min-h-[3.35rem] rounded-[20px] bg-ink px-4 text-sm font-semibold text-white disabled:opacity-45">
            {isPending ? "Saving..." : activeHole === 9 ? "Front 9 / Next" : isFinalHole ? "Finish Round" : "Next Hole"}
            </button>
          </div>
      </div>
    </div>
  );
}

function LeadersTab({
  rows,
  leaders,
  projections,
  teamStandings,
  sideGames,
  onOpenRound
}: {
  rows: CalculatedRoundRow[];
  leaders: ReturnType<typeof calculateLiveLeaders>;
  projections: ReturnType<typeof calculateLiveProjections>;
  teamStandings: TeamStanding[];
  sideGames: SideGameResults;
  onOpenRound: () => void;
}) {
  const orderedTeamStandings = sortTeamsAlphabetically(teamStandings);
  return (
    <div className="space-y-4">
      <SectionCard className="space-y-3 bg-ink text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">Live Leaders</p>
            <h3 className="mt-1 text-2xl font-semibold tracking-tight">Quick standings check</h3>
          </div>
          <button type="button" onClick={onOpenRound} className="rounded-2xl bg-white/12 px-4 py-3 text-sm font-semibold text-white">
            Back To Round
          </button>
        </div>
        <div className="grid gap-2">
          <div className="rounded-2xl bg-white/10 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/55">Leaders (Top 25%)</p>
            <p className="mt-1 text-sm font-semibold">{leaders.leaderGroup.length ? leaders.leaderGroup.map((entry, index) => `${formatPlace(index + 1)} ${entry.playerName} ${formatPlusMinus(entry.plusMinus)}`).join(" | ") : "-"}</p>
          </div>
          <div className="rounded-2xl bg-white/10 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/55">Payout Positions</p>
            <p className="mt-1 text-sm font-semibold">{sideGames.individualPayouts.length ? sideGames.individualPayouts.map((entry) => `${entry.placeLabel}. ${entry.playerName} ${formatCurrency(entry.payout)}`).join(" | ") : "-"}</p>
          </div>
          <div className="rounded-2xl bg-white/10 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/55">Skins Pot</p>
                <p className="mt-1 text-xl font-semibold">{formatCurrency(sideGames.skins.totalPot)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/55">Carryover</p>
                <p className="mt-1 text-xl font-semibold">{sideGames.skins.currentCarryoverCount || 0}</p>
              </div>
            </div>
            <p className="mt-2 text-sm text-white/72">{sideGames.skins.currentCarryoverHoles.length ? `Active holes: ${sideGames.skins.currentCarryoverHoles.join(", ")}` : "No active carryover holes."}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Win Projections</p>
        <div className="grid gap-2">
          {[
            { label: "Front Team", projection: projections.frontTeam },
            { label: "Back Team", projection: projections.backTeam },
            { label: "Total Team", projection: projections.totalTeam },
            { label: "Individual Quota", projection: projections.individual }
          ].map((item) => (
            <div key={item.label} className="rounded-[22px] bg-canvas px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">{item.label}</p>
                  <p className="mt-1 text-lg font-semibold">{item.projection?.leaderLabel ?? "-"}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold">{item.projection ? `${item.projection.probability}%` : "-"}</p>
                  <p className="mt-1 text-xs text-ink/60">Estimate</p>
                </div>
              </div>
              {item.projection ? (
                <p className="mt-2 text-sm text-ink/60">{`Margin ${formatPlusMinus(item.projection.margin)} | ${item.projection.holesRemaining} hole${item.projection.holesRemaining === 1 ? "" : "s"} left`}</p>
              ) : null}
            </div>
          ))}
          <div className="rounded-[22px] bg-[#FFF1BF] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Skins Projection</p>
                <p className="mt-1 text-lg font-semibold">{projections.skins.heading}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-semibold">
                  {projections.skins.probability == null ? "Live" : `${projections.skins.probability}%`}
                </p>
                <p className="mt-1 text-xs text-ink/60">{projections.skins.probability == null ? "Projection" : "Estimate"}</p>
              </div>
            </div>
            <p className="mt-2 text-sm text-ink/70">{projections.skins.detail}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Full Leaderboard</p>
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.playerId} className="flex items-center justify-between rounded-[22px] bg-canvas px-4 py-3">
              <div>
                <p className="text-base font-semibold">{row.playerName}</p>
                <p className="mt-1 text-xs text-ink/60">{`Rank ${row.rank} | Team ${row.team ?? "-"}`}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold">{formatPlusMinus(row.plusMinus)}</p>
                <p className="mt-1 text-xs text-ink/60">{`${row.totalPoints} pts`}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Team Leaders</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Front", team: leaders.frontTeam, pot: sideGames.teamPots.frontPot },
            { label: "Back", team: leaders.backTeam, pot: sideGames.teamPots.backPot },
            { label: "Total", team: leaders.totalTeam, pot: sideGames.teamPots.totalPot }
          ].map((item) => (
            <div key={item.label} className="rounded-[22px] bg-canvas px-3 py-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">{item.label}</p>
              <p className="mt-1 text-lg font-semibold">{item.team ? `Team ${item.team.team}` : "-"}</p>
              <p className="mt-1 text-base font-semibold">{item.team ? formatPlusMinus(teamLeaderValue(item.team, item.label.toLowerCase() as "front" | "back" | "total")) : "-"}</p>
              <p className="mt-1 text-xs text-ink/60">{formatCurrency(item.pot)}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="space-y-2">
        {orderedTeamStandings.map((team) => (
          <SectionCard key={team.team} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">{`Team ${team.team}`}</p>
                <p className="mt-1 text-sm text-ink/60">{team.players.join(", ")}</p>
              </div>
              <div className="rounded-2xl bg-canvas px-4 py-3 text-center">
                <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Total +/-</p>
                <p className="mt-1 text-2xl font-semibold">{formatPlusMinus(team.totalPlusMinus)}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
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
          </SectionCard>
        ))}
      </div>

      <SectionCard className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Skins Breakdown</p>
        <div className="space-y-2">
          {sideGames.skins.holes.length ? (
            sideGames.skins.holes.map((hole) => (
              <div key={hole.holeNumber} className="rounded-[22px] bg-canvas px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-base font-semibold">{`Hole ${hole.holeNumber}`}</p>
                  <span className={classNames("rounded-full px-3 py-1.5 text-xs font-semibold", hole.skinAwarded ? "bg-[#E2F4E6] text-pine" : "bg-white text-ink/70")}>
                    {hole.skinAwarded ? "Skin Won" : "Carryover"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-ink/65">
                  {hole.skinAwarded
                    ? `${hole.winnerName} won ${hole.sharesCaptured} skin share${hole.sharesCaptured === 1 ? "" : "s"}`
                    : hole.eligibleNames.length
                      ? `Tie at best qualifying score: ${hole.eligibleNames.join(", ")}`
                      : "No birdie or better"}
                </p>
              </div>
            ))
          ) : (
            <div className="rounded-[22px] bg-canvas px-4 py-3 text-sm text-ink/60">No completed skin holes yet.</div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

function RoundTabView({
  roundId,
  rows,
  teamStandings,
  teamRowsByCode,
  sideGames,
  playerBuyIns,
  initialBuyInPaidPlayerIds,
  isTestRound,
  onDeleteRound,
  onOpenTeam
}: {
  roundId: string;
  rows: CalculatedRoundRow[];
  teamStandings: TeamStanding[];
  teamRowsByCode: Map<TeamCode, CalculatedRoundRow[]>;
  sideGames: SideGameResults;
  playerBuyIns: PlayerBuyInSummary;
  initialBuyInPaidPlayerIds: string[];
  isTestRound: boolean;
  onDeleteRound: () => void;
  onOpenTeam: (team: TeamCode) => void;
}) {
  const orderedTeamStandings = sortTeamsAlphabetically(teamStandings);
  return (
    <div className="space-y-4">
      <SectionCard className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
              Current Round
            </p>
            <h3 className="mt-1 text-lg font-semibold">
              {isTestRound ? "Test Round Controls" : "Round Controls"}
            </h3>
            <p className="mt-1 text-sm text-ink/75">
              {isTestRound
                ? "Safe testing is on. This round will not change player quotas and can be deleted anytime."
                : "Use cancel only if this live round was created by mistake before real scoring should continue."}
            </p>
          </div>
          {isTestRound ? <TestRoundBadge subtle /> : null}
        </div>
        <button
          type="button"
          onClick={onDeleteRound}
          className="min-h-12 w-full rounded-[22px] bg-danger/12 px-4 text-sm font-semibold text-danger"
        >
          {isTestRound ? "Delete Test Round" : "Cancel Current Round"}
        </button>
      </SectionCard>

      <BuyInStatusSection
        roundId={roundId}
        buyIns={playerBuyIns}
        initialBuyInPaidPlayerIds={initialBuyInPaidPlayerIds}
      />

      <div className="space-y-3">
        {orderedTeamStandings.map((team) => {
          const teamRows = teamRowsByCode.get(team.team) ?? [];
          const progress = getTeamProgress(teamRows);
          const teamComplete = isTeamFinished(teamRows);
          return (
            <button key={team.team} type="button" onClick={() => onOpenTeam(team.team)} className="w-full rounded-[28px] border border-ink/10 bg-white/90 px-4 py-4 text-left shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-2xl font-semibold">{`Team ${team.team}`}</p>
                  <p className="mt-1 text-sm text-ink/60">{team.players.join(", ")}</p>
                  {teamComplete ? (
                    <span className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#E2F4E6] px-3 py-1.5 text-xs font-semibold text-pine">
                      <span aria-hidden="true">âœ”</span>
                      Team Complete
                    </span>
                  ) : null}
                </div>
                <div
                  className={classNames(
                    "rounded-2xl px-4 py-3 text-center",
                    teamComplete ? "bg-[#E2F4E6]" : "bg-canvas"
                  )}
                >
                  <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">
                    {teamComplete ? "Status" : "Next Hole"}
                  </p>
                  <p className="mt-1 text-2xl font-semibold">
                    {teamComplete ? "Completed" : Math.min(progress + 1, 18)}
                  </p>
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

    </div>
  );
}

function SkinsOnlyRoundTab({
  roundId,
  rows,
  sideGames,
  playerBuyIns,
  initialBuyInPaidPlayerIds,
  isTestRound,
  onDeleteRound,
  onOpenEntry
}: {
  roundId: string;
  rows: CalculatedRoundRow[];
  sideGames: SideGameResults;
  playerBuyIns: PlayerBuyInSummary;
  initialBuyInPaidPlayerIds: string[];
  isTestRound: boolean;
  onDeleteRound: () => void;
  onOpenEntry: () => void;
}) {
  return (
    <div className="space-y-4">
      <SectionCard className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
              Current Round
            </p>
            <h3 className="mt-1 text-lg font-semibold">
              {isTestRound ? "Test Round Controls" : "Round Controls"}
            </h3>
            <p className="mt-1 text-sm text-ink/75">
              {isTestRound
                ? "Safe testing is on. This skins round will not change player quotas and can be deleted anytime."
                : "Use cancel only if this skins round was created by mistake before play continues."}
            </p>
          </div>
          {isTestRound ? <TestRoundBadge subtle /> : null}
        </div>
        <button
          type="button"
          onClick={onDeleteRound}
          className="min-h-12 w-full rounded-[22px] bg-danger/12 px-4 text-sm font-semibold text-danger"
        >
          {isTestRound ? "Delete Test Round" : "Cancel Current Round"}
        </button>
      </SectionCard>

      <SectionCard className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Individual Quota + Skins</p>
            <h3 className="mt-1 text-xl font-semibold">Live skins game</h3>
            <p className="mt-1 text-sm text-ink/65">Enter hole scores, watch outright skins, and track carryovers.</p>
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

      <BuyInStatusSection
        roundId={roundId}
        buyIns={playerBuyIns}
        initialBuyInPaidPlayerIds={initialBuyInPaidPlayerIds}
      />

      <SectionCard className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Players</p>
        <div className="space-y-2">
          {rows.map((row) => {
            const completedHoles = row.holeScores.filter((score) => score != null).length;
            const playerComplete = hasRecordedFinalHole(row.holeScores);

            return (
              <div key={row.playerId} className="flex items-center justify-between rounded-2xl bg-canvas px-4 py-3">
                <div>
                  <p className="text-base font-semibold">{row.playerName}</p>
                  <p className="mt-1 text-xs text-ink/60">{`${row.totalPoints} points`}</p>
                  {playerComplete ? (
                    <span className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#E2F4E6] px-3 py-1.5 text-xs font-semibold text-pine">
                      <span aria-hidden="true">âœ”</span>
                      Completed
                    </span>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold">{row.totalPoints}</p>
                  <p className="mt-1 text-xs text-ink/60">
                    {playerComplete ? "Completed" : `Next Hole ${Math.min(completedHoles + 1, 18)}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}

function SkinsOnlyScoreEntry({
  isTestRound,
  activeHole,
  rows,
  message,
  toast,
  saveState,
  refreshState,
  isPending,
  lastRefreshedAt,
  canGoBack,
  canSaveHole,
  onUpdateHole,
  onPreviousHole,
  onSaveHole,
  onSelectHole,
  onBackToRound,
  onRefresh
}: {
  isTestRound: boolean;
  activeHole: number;
  rows: CalculatedRoundRow[];
  message: string;
  toast: string;
  saveState: SaveState;
  refreshState: SaveState;
  isPending: boolean;
  lastRefreshedAt: string | null;
  canGoBack: boolean;
  canSaveHole: boolean;
  onUpdateHole: (playerId: string, holeIndex: number, value: number | null) => void;
  onPreviousHole: () => void;
  onSaveHole: () => void;
  onSelectHole: (hole: number) => void;
  onBackToRound: () => void;
  onRefresh: () => void;
}) {
  function handleHoleButtonClick(holeNumber: number) {
    onSelectHole(holeNumber);
  }

  const activeHoleIndex = activeHole - 1;
  const isFinalHole = activeHole === 18;
  const lastRefreshedLabel = formatTimeLabel(lastRefreshedAt);

    return (
      <div className="space-y-3 pb-28">
        <SectionCard className="sticky top-2 z-20 space-y-2.5 border-white/70 bg-white/95 py-3 shadow-lg backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Live Scoring</p>
              <h3 className="mt-1 text-xl font-semibold">Individual Quota + Skins</h3>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white">
                  {`Hole ${activeHole} of 18`}
                </span>
                {isTestRound ? <TestRoundBadge subtle /> : null}
                {saveState.tone === "failed" && saveState.message ? (
                  <span className={classNames("rounded-full px-3 py-1.5 text-xs font-semibold", getSaveToneClass(saveState.tone))}>
                    {saveState.message}
                  </span>
                ) : null}
                {saveState.tone === "saved" && toast ? (
                  <span className="rounded-full bg-[#E2F4E6] px-3 py-1.5 text-xs font-semibold text-pine">
                    {toast}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="rounded-[22px] bg-ink px-3 py-2.5 text-right text-white">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/55">Current Hole</p>
              <p className="mt-1 text-[2rem] font-semibold leading-none">{activeHole}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={onRefresh} className="min-h-11 rounded-2xl bg-canvas px-4 py-2.5 text-sm font-semibold text-ink">
            {refreshState.tone === "saving" ? "Refreshing..." : "Refresh"}
          </button>
          <button type="button" onClick={onBackToRound} className="min-h-11 rounded-2xl bg-canvas px-4 py-2.5 text-sm font-semibold text-ink">
            Back To Round
          </button>
          {refreshState.tone === "failed" && refreshState.message ? (
            <span className="text-xs font-semibold text-danger">{refreshState.message}</span>
          ) : null}
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {holeNumbers.map((holeNumber) => (
            <button
              key={holeNumber}
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleHoleButtonClick(holeNumber);
              }}
              className={classNames(
                  "touch-manipulation min-h-[3rem] rounded-[18px] px-3 text-sm font-semibold transition-all duration-200",
                  holeNumber === activeHole
                    ? "min-w-[4rem] bg-ink text-base text-white shadow-card"
                    : "min-w-[3rem] bg-canvas text-ink"
                )}
              >
                {holeNumber}
              </button>
            ))}
          </div>
        </SectionCard>
  
        <div className="relative z-10 space-y-2">
          {rows.map((row) => {
            const completedHoles = countCompletedPlayerHoles(row.holeScores);
            const progressTone = getPlayerQuotaProgressTone(
              row.totalPoints,
              row.startQuota,
              completedHoles
            );

            return (
              <div key={row.playerId} className="rounded-[20px] border border-ink/10 bg-white px-3 py-2.5 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold leading-tight text-ink">{row.playerName}</p>
                    <p className={classNames("mt-0.5 text-xs font-semibold leading-none", progressTone)}>
                      {`${row.totalPoints} / ${row.startQuota}`}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-canvas px-2 py-1 text-xs font-semibold text-ink/75">
                    {row.holeScores[activeHoleIndex] ?? "-"}
                  </span>
                </div>
                <ScoreButtonGroup compact value={row.holeScores[activeHoleIndex]} onSelect={(value) => onUpdateHole(row.playerId, activeHoleIndex, value)} />
              </div>
            );
          })}
        </div>
  
        <div
          className="fixed left-1/2 z-30 w-[calc(100%-1rem)] max-w-md -translate-x-1/2 rounded-[26px] border border-white/80 bg-white/96 p-2.5 shadow-card backdrop-blur"
          style={{
            bottom: "calc(5.5rem + env(safe-area-inset-bottom))"
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onPreviousHole} disabled={isPending || !canGoBack} className="min-h-[3.35rem] rounded-[20px] border border-ink/10 bg-canvas px-4 text-sm font-semibold text-ink disabled:opacity-45">
              Previous Hole
            </button>
              <button type="button" onClick={onSaveHole} disabled={isPending || !canSaveHole} className="min-h-[3.35rem] rounded-[20px] bg-ink px-4 text-sm font-semibold text-white disabled:opacity-45">
              {isPending ? "Saving..." : activeHole === 9 ? "Front 9 / Next" : isFinalHole ? "Finish Round" : "Next Hole"}
              </button>
          </div>
      </div>
    </div>
  );
}

function SkinsOnlyLeadersTab({
  sideGames,
  projections,
  onOpenRound
}: {
  sideGames: SideGameResults;
  projections: ReturnType<typeof calculateLiveProjections>;
  onOpenRound: () => void;
}) {
  const topWinner = sideGames.skins.winners[0] ?? null;

  return (
    <div className="space-y-4">
      <SectionCard className="space-y-3 bg-ink text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">Individual Quota + Skins</p>
            <h3 className="mt-1 text-2xl font-semibold tracking-tight">Live skins board</h3>
          </div>
          <button type="button" onClick={onOpenRound} className="rounded-2xl bg-white/12 px-4 py-3 text-sm font-semibold text-white">
            Back To Round
          </button>
        </div>
        <div className="grid gap-2">
          <div className="rounded-2xl bg-white/10 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/55">Skins Leader</p>
            <p className="mt-1 text-lg font-semibold">{topWinner ? topWinner.playerName : "No winner yet"}</p>
            <p className="mt-1 text-sm text-white/80">
              {topWinner ? `${topWinner.skinsWon} skin share${topWinner.skinsWon === 1 ? "" : "s"} | ${formatCurrency(topWinner.payout)}` : "No outright skins captured yet."}
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/55">Carryover</p>
            <p className="mt-1 text-lg font-semibold">{`${sideGames.skins.currentCarryoverCount} hole${sideGames.skins.currentCarryoverCount === 1 ? "" : "s"}`}</p>
            <p className="mt-1 text-sm text-white/80">
              {sideGames.skins.currentCarryoverHoles.length
                ? `Open holes: ${sideGames.skins.currentCarryoverHoles.join(", ")}`
                : "No active carryovers."}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Skins Projection</p>
        <div className="rounded-[22px] bg-[#FFF1BF] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Favorite</p>
              <p className="mt-1 text-lg font-semibold">{projections.skins.heading}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold">
                {projections.skins.probability == null ? "Live" : `${projections.skins.probability}%`}
              </p>
              <p className="mt-1 text-xs text-ink/60">{projections.skins.probability == null ? "Projection" : "Estimate"}</p>
            </div>
          </div>
          <p className="mt-2 text-sm text-ink/70">{projections.skins.detail}</p>
        </div>
      </SectionCard>

      <SectionCard className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Skins Breakdown</p>
        <div className="space-y-2">
          {sideGames.skins.holes.length ? (
            sideGames.skins.holes.map((hole) => (
              <div key={hole.holeNumber} className="rounded-[22px] bg-canvas px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-base font-semibold">{`Hole ${hole.holeNumber}`}</p>
                  <span className={classNames("rounded-full px-3 py-1.5 text-xs font-semibold", hole.skinAwarded ? "bg-[#E2F4E6] text-pine" : "bg-white text-ink/70")}>
                    {hole.skinAwarded ? "Skin Won" : "Carryover"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-ink/65">
                  {hole.skinAwarded
                    ? `${hole.winnerName} won ${hole.sharesCaptured} skin share${hole.sharesCaptured === 1 ? "" : "s"}`
                    : hole.eligibleNames.length
                      ? `Tie at best qualifying score: ${hole.eligibleNames.join(", ")}`
                      : "No birdie or better"}
                </p>
              </div>
            ))
          ) : (
            <div className="rounded-[22px] bg-canvas px-4 py-3 text-sm text-ink/60">No completed skin holes yet.</div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

function BuyInStatusSection({
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
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
            Players Owing
          </p>
          <h3 className="mt-1 text-lg font-semibold">Who still owes money?</h3>
          <p className="mt-1 text-sm text-ink/65">
            {unpaidPlayers.length
              ? `${unpaidPlayers.length} player${unpaidPlayers.length === 1 ? "" : "s"} still owe into today's pot.`
              : "All players are paid in for this round."}
          </p>
        </div>
        <div className="rounded-2xl bg-canvas px-4 py-3 text-right">
          <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Collected</p>
          <p className="mt-1 text-xl font-semibold">
            {`${formatCurrency(collectedTotal)} / ${formatCurrency(totalOwed)}`}
          </p>
        </div>
      </div>

      {message ? <p className="text-sm font-medium text-ink/70">{message}</p> : null}

      {unpaidPlayers.length ? (
        <div className="space-y-2">
          {unpaidPlayers.map((player) => (
            <div
              key={player.playerId}
              className="rounded-[22px] border border-ink/10 bg-canvas px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-ink">{player.playerName}</p>
                  <p className="mt-1 text-sm text-ink/65">{formatCurrency(player.totalOwed)}</p>
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
          <p className="text-base font-semibold text-pine">All players paid in ðŸ‘</p>
        </div>
      )}
    </SectionCard>
  );
}

function PlayersTab({
  rows,
  leaders,
  sideGames,
  mode
}: {
  rows: CalculatedRoundRow[];
  leaders: ReturnType<typeof calculateLiveLeaders>;
  sideGames: SideGameResults;
  mode: RoundMode;
}) {
  const isSkinsOnly = mode === "SKINS_ONLY";
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const rankTone = getRankTone(row);
        const skinsWinner = sideGames.skins.winners.find((winner) => winner.playerId === row.playerId);
        const birdiesOrBetter = row.holeScores.filter((score) => score === 4 || score === 6).length;
        const playerComplete = hasRecordedFinalHole(row.holeScores);

        return (
          <SectionCard key={row.playerId} className={classNames("space-y-3 border", rankTone === "first" ? "border-[#5A9764] bg-[#E2F4E6]" : rankTone === "second" ? "border-[#D5B154] bg-[#FFF1BF]" : rankTone === "third" ? "border-[#D37A47] bg-[#FCE0D2]" : row.plusMinus < 0 ? "border-[#D7655D] bg-[#FCE5E2]" : "border-white/70 bg-white/85")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold">{row.playerName}</h3>
                <p className="mt-1 text-sm text-ink/60">
                  {isSkinsOnly ? `Total ${row.totalPoints} points` : `Team ${row.team ?? "-"} | Rank ${row.rank}`}
                </p>
                {playerComplete ? (
                  <span className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#E2F4E6] px-3 py-1.5 text-xs font-semibold text-pine">
                    <span aria-hidden="true">âœ”</span>
                    Completed
                  </span>
                ) : null}
              </div>
              {isSkinsOnly ? null : (
                <div className="rounded-2xl bg-white/80 px-4 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">+/-</p>
                  <p className={classNames("mt-1 text-2xl font-semibold", row.plusMinus < 0 ? "text-danger" : "text-ink")}>{formatPlusMinus(row.plusMinus)}</p>
                </div>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {(isSkinsOnly
                ? [
                    { label: "Points", value: row.totalPoints },
                    { label: "Front", value: row.frontNine },
                    { label: "Back", value: row.backNine },
                    { label: "Skins", value: skinsWinner?.skinsWon ?? 0 }
                  ]
                : [
                    { label: "Quota", value: row.startQuota },
                    { label: "Points", value: row.totalPoints },
                    { label: "Birdies+", value: birdiesOrBetter },
                    { label: "Skins", value: skinsWinner?.skinsWon ?? 0 }
                  ]).map((item) => (
                <div key={item.label} className="rounded-2xl bg-white/80 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">{item.label}</p>
                  <p className="mt-1 text-lg font-semibold">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {!isSkinsOnly && leaders.leaderGroup.some((entry) => entry.playerId === row.playerId) ? <span className="rounded-full bg-pine px-3 py-1.5 text-xs font-semibold text-white">Leader</span> : null}
              {!isSkinsOnly && leaders.payoutGroup.some((entry) => entry.playerId === row.playerId) ? <span className="rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white">Payout Position</span> : null}
              {skinsWinner ? <span className="rounded-full bg-[#E2F4E6] px-3 py-1.5 text-xs font-semibold text-pine">{`${skinsWinner.skinsWon} skin${skinsWinner.skinsWon === 1 ? "" : "s"}`}</span> : null}
            </div>
          </SectionCard>
        );
      })}
    </div>
  );
}

function SettingsTab({
  roundId,
  roundName,
  roundDate,
  notes,
  isTestRound,
  setRoundDate,
  setNotes,
  setIsTestRound,
  sideGames,
  isPending,
  isStarted,
  hasSavedScores,
  onSave,
  onCompleteRound,
  onDeleteRound,
  onForceDeleteRound
}: {
  roundId: string;
  roundName: string;
  roundDate: string;
  notes: string;
  isTestRound: boolean;
  setRoundDate: (value: string) => void;
  setNotes: (value: string) => void;
  setIsTestRound: (value: boolean | ((current: boolean) => boolean)) => void;
  sideGames: SideGameResults;
  isPending: boolean;
  isStarted: boolean;
  hasSavedScores: boolean;
  onSave: () => void;
  onCompleteRound: () => void;
  onDeleteRound: () => void;
  onForceDeleteRound: () => void;
}) {
  return (
    <div className="space-y-4">
      <SectionCard className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Round Settings</p>
          <h3 className="mt-1 text-2xl font-semibold">Admin and setup</h3>
        </div>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold">Round date</span>
          <input type="date" className="h-14 w-full rounded-2xl border border-ink/10 bg-canvas px-4 text-base outline-none" value={roundDate} onChange={(event) => setRoundDate(event.target.value)} />
        </label>
        <p className="text-sm text-ink/65">{`Round name will be ${roundName}`}</p>
        <label className="flex items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-canvas px-4 py-3">
          <span>
            <span className="block text-sm font-semibold">Test Round</span>
            <span className="mt-1 block text-xs text-ink/60">
              Skip player quota updates when this round is completed.
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={isTestRound}
            onClick={() => setIsTestRound((current) => !current)}
            className={classNames(
              "relative h-8 w-14 rounded-full transition",
              isTestRound ? "bg-pine" : "bg-ink/15"
            )}
          >
            <span
              className={classNames(
                "absolute top-1 h-6 w-6 rounded-full bg-white transition",
                isTestRound ? "left-7" : "left-1"
              )}
            />
          </button>
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold">Notes</span>
          <textarea rows={3} className="w-full rounded-2xl border border-ink/10 bg-canvas px-4 py-3 text-base outline-none" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <button type="button" onClick={onSave} disabled={isPending} className="min-h-14 w-full rounded-[24px] bg-ink px-5 text-base font-semibold text-white disabled:opacity-45">
          {isPending ? "Saving..." : "Save Round Settings"}
        </button>
        <button type="button" onClick={onCompleteRound} disabled={isPending} className="min-h-14 w-full rounded-[24px] bg-pine px-5 text-base font-semibold text-white disabled:opacity-45">
          {isPending ? "Working..." : "Complete Round"}
        </button>
        <button
          type="button"
          onClick={onDeleteRound}
          disabled={isPending || (hasSavedScores && !isTestRound)}
          className="min-h-14 w-full rounded-[24px] border border-danger/25 bg-danger/10 px-5 text-base font-semibold text-danger disabled:opacity-45"
        >
          {isTestRound ? "Delete Test Round" : isStarted ? "Cancel Current Round" : "Delete Round"}
        </button>
        <p className="text-sm text-ink/65">
          {isTestRound
            ? "Test rounds are safe to remove and do not affect real player quotas."
            : hasSavedScores
            ? "Saved scores were already entered, so this round can no longer be deleted here."
            : isStarted
              ? "Use this only for mistaken live rounds that have not recorded any scores yet."
              : "Delete an unstarted round if this setup should be discarded."}
        </p>
        <div className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-danger/80">
            Admin Only
          </p>
          <p className="mt-2 text-sm text-ink/70">
            {hasSavedScores
              ? "Force clear removes this active round and all unfinished live scoring data. Use it only if the round was created by mistake."
              : "Use force clear only if a stuck current round still will not leave the live flow after normal delete."}
          </p>
          <button
            type="button"
            onClick={onForceDeleteRound}
            disabled={isPending}
            className="mt-3 min-h-12 w-full rounded-[20px] border border-danger/30 bg-white px-4 py-3 text-sm font-semibold text-danger disabled:opacity-45"
          >
            {isPending ? "Working..." : "Force Clear Active Round"}
          </button>
        </div>
      </SectionCard>

      <SectionCard className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Round Tools</p>
          <h3 className="mt-1 text-lg font-semibold">Duplicate or reset template</h3>
        </div>
        <RoundUtilityActions roundId={roundId} />
      </SectionCard>

      <SectionCard className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Payout Snapshot</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Team Pot", value: formatCurrency(sideGames.overallPot.teamPot) },
            { label: "Front", value: formatCurrency(sideGames.overallPot.frontPot) },
            { label: "Back", value: formatCurrency(sideGames.overallPot.backPot) },
            { label: "Total", value: formatCurrency(sideGames.overallPot.totalTeamPot) },
            { label: "Indy Pot", value: formatCurrency(sideGames.overallPot.indyPot) },
            { label: "Skins Pot", value: formatCurrency(sideGames.overallPot.skinsPot) }
          ].map((item) => (
            <div key={item.label} className="rounded-2xl bg-canvas px-3 py-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">{item.label}</p>
              <p className="mt-1 text-lg font-semibold">{item.value}</p>
            </div>
          ))}
        </div>
      </SectionCard>

    </div>
  );
}






























