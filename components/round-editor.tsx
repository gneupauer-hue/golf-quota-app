"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { PageTitle } from "@/components/page-title";
import { RoundUtilityActions } from "@/components/round-utility-actions";
import { ScoreButtonGroup } from "@/components/score-button-group";
import { SectionCard } from "@/components/section-card";
import { TeamSummaryMini } from "@/components/team-summary-mini";
import {
  buildBalancedTeams,
  capacitiesToMap,
  evaluateTeamFormat,
  formatCapacitySummary,
  getTeamFormatKey,
  type EvaluatedTeamFormat,
  getTeamFormats,
  validateTeamAssignments
} from "@/lib/round-setup";
import {
  calculateLiveLeaders,
  calculateLiveProjections,
  calculateRoundRows,
  calculateSideGameResults,
  calculateTeamStandings,
  formatPlusMinus,
  getRankTone,
  hasSequentialHoleEntry,
  holeNumbers,
  isRoundRowComplete,
  teamOptions,
  type CalculatedRoundRow,
  type RoundMode,
  type SideGameResults,
  type TeamCode,
  type TeamStanding
} from "@/lib/quota";
import { classNames, formatDateInput, formatRoundNameFromDate } from "@/lib/utils";

type PlayerOption = {
  id: string;
  name: string;
  startingQuota: number;
  currentQuota: number;
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
    isTestRound: boolean;
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
};

type RoundTab = "round" | "leaders" | "players" | "settings";

const roundTabs: Array<{ id: RoundTab; label: string }> = [
  { id: "round", label: "Round" },
  { id: "leaders", label: "Leaders" },
  { id: "players", label: "Players" },
  { id: "settings", label: "Settings" }
];

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

function getSkinResultLabel(score: number | null | undefined) {
  if (score === 6) return "Eagle";
  if (score === 4) return "Birdie";
  return null;
}

function getSkinToastMessage(
  previousSkins: SideGameResults["skins"],
  nextSkins: SideGameResults["skins"],
  rows: CalculatedRoundRow[]
) {
  const previousByHole = new Map(previousSkins.holes.map((hole) => [hole.holeNumber, hole]));
  const nextByHole = new Map(nextSkins.holes.map((hole) => [hole.holeNumber, hole]));

  for (const hole of nextSkins.holes) {
    const previous = previousByHole.get(hole.holeNumber);
    if (hole.skinAwarded && (!previous?.skinAwarded || previous.winnerPlayerId !== hole.winnerPlayerId)) {
      const winner = rows.find((row) => row.playerId === hole.winnerPlayerId);
      const resultLabel = getSkinResultLabel(winner?.holeScores[hole.holeNumber - 1]);
      return resultLabel
        ? `Skin live: ${hole.winnerName} on Hole ${hole.holeNumber} (${resultLabel})`
        : `Skin live: ${hole.winnerName} on Hole ${hole.holeNumber}`;
    }
  }

  for (const hole of previousSkins.holes) {
    const next = nextByHole.get(hole.holeNumber);
    if (hole.skinAwarded && (!next || !next.skinAwarded) && next?.carryover) {
      return `Hole ${hole.holeNumber} now carries over`;
    }
  }

  return null;
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

function isTeamFinished(rows: Array<CalculatedRoundRow>) {
  return rows.length > 0 && rows.every((row) => hasRecordedFinalHole(row.holeScores));
}

export function RoundEditor({ round, players, quotaSnapshot, groups: initialGroups }: EditorProps) {
  const router = useRouter();
  const [roundDate, setRoundDate] = useState(formatDateInput(round.roundDate));
  const [notes, setNotes] = useState(round.notes);
  const [isTestRound, setIsTestRound] = useState(Boolean(round.isTestRound));
  const [rows, setRows] = useState<RowState[]>(
    round.entries.map((entry) => ({
      playerId: entry.playerId,
      team: entry.team,
      groupNumber: entry.groupNumber,
      teeTime: entry.teeTime,
      holeScores:
        entry.holeScores.length === 18
          ? entry.holeScores
          : Array.from({ length: 18 }, () => null)
    }))
  );
  const [savedRows, setSavedRows] = useState<RowState[]>(
    round.entries.map((entry) => ({
      playerId: entry.playerId,
      team: entry.team,
      groupNumber: entry.groupNumber,
      teeTime: entry.teeTime,
      holeScores:
        entry.holeScores.length === 18
          ? entry.holeScores
          : Array.from({ length: 18 }, () => null)
    }))
  );
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState("");
  const [isPending, startTransition] = useTransition();
  const [showSetup, setShowSetup] = useState(!round.lockedAt && rows.length > 0);
  const [gameMode, setGameMode] = useState<RoundMode>(round.roundMode ?? "MATCH_QUOTA");
  const [selectedFormatKey, setSelectedFormatKey] = useState("");
  const [lockedAt, setLockedAt] = useState<string | null>(round.lockedAt);
  const [startedAt, setStartedAt] = useState<string | null>(round.startedAt);
  const [activeTab, setActiveTab] = useState<RoundTab>(round.lockedAt ? "round" : "settings");
  const [selectedTeam, setSelectedTeam] = useState<TeamCode | null>(null);
  const [activeHoleByTeam, setActiveHoleByTeam] = useState<Partial<Record<TeamCode, number>>>({});
  const [skinsActiveHole, setSkinsActiveHole] = useState(1);
  const [skinsEntryOpen, setSkinsEntryOpen] = useState(false);
  const [selectedSetupPlayerId, setSelectedSetupPlayerId] = useState<string | null>(null);
  const derivedRoundName = formatRoundNameFromDate(roundDate);
  const isSkinsOnly = gameMode === "SKINS_ONLY";

  const isLocked = Boolean(lockedAt);
  const selectedIds = useMemo(() => new Set(rows.map((row) => row.playerId)), [rows]);
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

  const setupPlayersForBalancing = useMemo(
    () =>
      rows
        .map((row) => {
          const player = playersById.get(row.playerId);
          if (!player) return null;
          return {
            playerId: player.id,
            playerName: player.name,
            quota: quotaSnapshot[player.id] ?? player.currentQuota ?? player.startingQuota,
            conflictIds: player.conflictIds
          };
        })
        .filter(Boolean) as Array<{
        playerId: string;
        playerName: string;
        quota: number;
        conflictIds: string[];
      }>,
    [playersById, quotaSnapshot, rows]
  );

  const setupFormatOptions = useMemo<EvaluatedTeamFormat[]>(
    () => {
      if (isSkinsOnly) {
        return [];
      }

      const formats = getTeamFormats(rows.length);
      if (!setupPlayersForBalancing.length) {
        return formats.map((format) => ({ ...format, estimatedSpread: null }));
      }

      return formats
        .map((format) => {
          try {
            return evaluateTeamFormat(setupPlayersForBalancing, format);
          } catch (error) {
            console.warn("[team-builder] format-evaluation-failed", {
              format: format.label,
              capacities: format.capacities,
              error: error instanceof Error ? error.message : "Unknown format evaluation error"
            });
            return {
              ...format,
              estimatedSpread: null
            } satisfies EvaluatedTeamFormat;
          }
        })
        .sort((left, right) => {
          if (left.estimatedSpread == null && right.estimatedSpread != null) {
            return 1;
          }

          if (left.estimatedSpread != null && right.estimatedSpread == null) {
            return -1;
          }

          if (left.estimatedSpread !== right.estimatedSpread) {
            return (left.estimatedSpread ?? Number.POSITIVE_INFINITY) - (right.estimatedSpread ?? Number.POSITIVE_INFINITY);
          }

          if (left.isEqual !== right.isEqual) {
            return left.isEqual ? -1 : 1;
          }

          const leftAverage =
            left.capacities.reduce((sum, value) => sum + value, 0) / left.capacities.length;
          const rightAverage =
            right.capacities.reduce((sum, value) => sum + value, 0) / right.capacities.length;

          if (rightAverage !== leftAverage) {
            return rightAverage - leftAverage;
          }

          return left.teamCount - right.teamCount;
        });
    },
    [isSkinsOnly, rows.length, setupPlayersForBalancing]
  );
  const selectedFormat = useMemo(
    () =>
      setupFormatOptions.find((format) => getTeamFormatKey(format) === selectedFormatKey) ??
      null,
    [selectedFormatKey, setupFormatOptions]
  );
  const activeSetupFormat = selectedFormat ?? setupFormatOptions[0] ?? null;
  const setupTeamCodes = useMemo(
    () => (isSkinsOnly ? [] : teamOptions.slice(0, activeSetupFormat?.teamCount ?? 0)),
    [activeSetupFormat, isSkinsOnly]
  );
  const setupTeamCapacities = useMemo(
    () => capacitiesToMap(setupTeamCodes, activeSetupFormat?.capacities ?? []),
    [activeSetupFormat, setupTeamCodes]
  );
  const setupFormatTeamLabels = useMemo(
    () =>
      setupTeamCodes.map((team, index) => `Team ${team} ${activeSetupFormat?.capacities[index] ?? 0}`),
    [activeSetupFormat, setupTeamCodes]
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
            startQuota: quotaSnapshot[row.playerId] ?? player.currentQuota ?? player.startingQuota,
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
    );
  }, [playersById, quotaSnapshot, rows]);

  const liveLeaders = useMemo(() => calculateLiveLeaders(calculatedRows), [calculatedRows]);
  const liveProjections = useMemo(() => calculateLiveProjections(calculatedRows), [calculatedRows]);
  const teamStandings = useMemo(() => calculateTeamStandings(calculatedRows), [calculatedRows]);
  const sideGames = useMemo(() => calculateSideGameResults(calculatedRows), [calculatedRows]);
  const savedCalculatedRows = useMemo(() => {
    return calculateRoundRows(
      savedRows
        .map((row) => {
          const player = playersById.get(row.playerId);
          if (!player) return null;
          return {
            playerId: row.playerId,
            playerName: player.name,
            team: row.team,
            startQuota: quotaSnapshot[row.playerId] ?? player.currentQuota ?? player.startingQuota,
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
    );
  }, [playersById, quotaSnapshot, savedRows]);
  const savedSideGames = useMemo(() => calculateSideGameResults(savedCalculatedRows), [savedCalculatedRows]);
  const invalidSequence = rows.some((row) => !hasSequentialHoleEntry(row.holeScores));
  const completedRound = rows.length > 0 && rows.every((row) => isRoundRowComplete(row.holeScores));
  const hasSavedScores = useMemo(
    () => rows.some((row) => row.holeScores.some((score) => score != null)),
    [rows]
  );

  const setupValidation = useMemo(() => {
    if (isSkinsOnly) {
      return rows.length
        ? { valid: true, reason: "" }
        : { valid: false, reason: "Add players before starting the skins game." };
    }

    const assignedRows = rows.filter(
      (row): row is RowState & { team: TeamCode } =>
        row.team != null && setupTeamCodes.includes(row.team)
    );

    if (!assignedRows.length) {
      return { valid: false, reason: "Teams have not been assigned yet." };
    }

    if (assignedRows.length !== rows.length) {
      return { valid: false, reason: "Every player needs a team before the round can start." };
    }

    const validation = validateTeamAssignments(
      assignedRows.map((row) => ({
        playerId: row.playerId,
        team: row.team
      })),
      setupTeamCodes,
      setupTeamCapacities
    );

    if (!validation.valid) {
      return {
        valid: false,
        reason: formatCapacitySummary(setupTeamCodes, setupTeamCapacities)
      };
    }

    return { valid: true, reason: "" };
  }, [isSkinsOnly, rows, setupTeamCapacities, setupTeamCodes]);

  const setupTeams = useMemo(() => {
    return setupTeamCodes.map((team) => {
      const teamRows = rows.filter((row) => row.team === team);
      const totalQuota = teamRows.reduce((sum, row) => {
        const player = playersById.get(row.playerId);
        return sum + (player ? quotaSnapshot[row.playerId] ?? player.currentQuota ?? player.startingQuota : 0);
      }, 0);

      return {
        team,
        capacity: setupTeamCapacities.get(team) ?? 0,
        players: teamRows.map((row) => {
          const player = playersById.get(row.playerId);
          return {
            playerId: row.playerId,
            playerName: player?.name ?? "Unknown Player",
            quota: player
              ? quotaSnapshot[row.playerId] ?? player.currentQuota ?? player.startingQuota
              : 0
          };
        }),
        totalQuota
      };
    });
  }, [playersById, quotaSnapshot, rows, setupTeamCapacities, setupTeamCodes]);

  const setupQuotaSpread = useMemo(() => {
    const totals = setupTeams.map((team) => team.totalQuota);
    return totals.length ? Math.max(...totals) - Math.min(...totals) : 0;
  }, [setupTeams]);
  const canStartConfiguredRound =
    rows.length > 0 && (isSkinsOnly || Boolean(activeSetupFormat)) && setupValidation.valid;

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 1000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!showSetup || isLocked) {
      return;
    }

    if (isSkinsOnly) {
      setRows((current) =>
        current.map((row) =>
          row.team == null && row.groupNumber == null && row.teeTime == null
            ? row
            : { ...row, team: null, groupNumber: null, teeTime: null }
        )
      );
      setSelectedSetupPlayerId(null);
    }
  }, [isLocked, isSkinsOnly, showSetup]);

  useEffect(() => {
    if (isSkinsOnly) {
      if (selectedFormatKey) {
        setSelectedFormatKey("");
      }
      return;
    }

    if (!setupFormatOptions.length) {
      if (selectedFormatKey) {
        setSelectedFormatKey("");
      }
      return;
    }

    if (!selectedFormatKey && round.teamCount) {
      const teamSizes = setupFormatOptions
        .map((format) => ({
          format,
          matches:
            format.teamCount === round.teamCount &&
            format.capacities.every((capacity, index) => {
              const teamCode = teamOptions[index];
              const actualSize = rows.filter((row) => row.team === teamCode).length;
              return actualSize === 0 || actualSize === capacity;
            })
        }))
        .find((option) => option.matches)?.format;

      if (teamSizes) {
        setSelectedFormatKey(getTeamFormatKey(teamSizes));
        return;
      }
    }

    if (setupFormatOptions.length === 1) {
      const onlyOption = getTeamFormatKey(setupFormatOptions[0]);
      if (selectedFormatKey !== onlyOption) {
        setSelectedFormatKey(onlyOption);
      }
      return;
    }

    if (!selectedFormat) {
      setSelectedFormatKey(getTeamFormatKey(setupFormatOptions[0]));
    }
  }, [isSkinsOnly, round.teamCount, rows, selectedFormat, selectedFormatKey, setupFormatOptions]);

  useEffect(() => {
    if (isLocked || !showSetup || !rows.length || isSkinsOnly) {
      return;
    }

    if (!activeSetupFormat) {
      return;
    }

    if (setupValidation.valid) {
      return;
    }

    try {
      const setupPlayers = rows
        .map((row) => {
          const player = playersById.get(row.playerId);
          if (!player) return null;
          return {
            playerId: player.id,
            playerName: player.name,
            quota: quotaSnapshot[player.id] ?? player.currentQuota ?? player.startingQuota,
            conflictIds: player.conflictIds
          };
        })
        .filter(Boolean) as Array<{
        playerId: string;
        playerName: string;
        quota: number;
        conflictIds: string[];
      }>;

      const teamAssignments = buildBalancedTeams(
        setupPlayers,
        setupTeamCodes,
        setupTeamCapacities
      );
      setRows((current) =>
        current.map((row) => ({
          ...row,
          team:
            teamAssignments.find((assignment) => assignment.playerId === row.playerId)?.team ?? null,
          groupNumber: null,
          teeTime: null
        }))
      );
      setSelectedSetupPlayerId(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not build teams for this round.");
    }
  }, [
    isLocked,
    isSkinsOnly,
    playersById,
    quotaSnapshot,
    rows,
    activeSetupFormat,
    setupValidation.valid,
    showSetup
  ]);

  async function persistRound(
    nextRows = rows,
    nextLockedAt = lockedAt,
    nextStartedAt = startedAt,
    nextTeamCount = activeSetupFormat ? String(activeSetupFormat.teamCount) : "",
    nextRoundName = derivedRoundName,
    nextRoundDate = roundDate,
    nextNotes = notes,
    forceComplete = false
  ) {
    const payload = {
      roundName: nextRoundName,
      roundDate: nextRoundDate,
      roundMode: gameMode,
      isTestRound,
      notes: nextNotes,
      teamCount: gameMode === "SKINS_ONLY" ? null : nextLockedAt ? Number(nextTeamCount) : null,
      lockedAt: nextLockedAt,
      startedAt: nextStartedAt,
      forceComplete,
      entries: nextRows.map((row) => ({
        playerId: row.playerId,
        team: row.team,
        groupNumber: row.groupNumber,
        teeTime: row.teeTime,
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
        holeScores: Array.from({ length: 18 }, () => null)
      }
    ]);
    setSearch("");
    setShowSetup(true);
    setSelectedSetupPlayerId(null);
  }

  function removePlayer(playerId: string) {
    if (isLocked) return;
    setRows((current) => current.filter((row) => row.playerId !== playerId));
    setSelectedSetupPlayerId((current) => (current === playerId ? null : current));
  }

  function updateHole(playerId: string, holeIndex: number, value: number) {
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

  function autoBuildTeams(nextFormat = activeSetupFormat) {
    try {
      if (!rows.length) {
        setMessage("Add players before building teams.");
        return;
      }
      if (!nextFormat) {
        setMessage("Choose a valid team format first.");
        return;
      }

      const setupPlayers = rows
        .map((row) => {
          const player = playersById.get(row.playerId);
          if (!player) return null;
          return {
            playerId: player.id,
            playerName: player.name,
            quota: quotaSnapshot[player.id] ?? player.currentQuota ?? player.startingQuota,
            conflictIds: player.conflictIds
          };
        })
        .filter(Boolean) as Array<{
        playerId: string;
        playerName: string;
        quota: number;
        conflictIds: string[];
      }>;

      const nextTeamCodes = teamOptions.slice(0, nextFormat.teamCount);
      const nextCapacities = capacitiesToMap(nextTeamCodes, nextFormat.capacities);
      console.info("[team-builder] selected-format", {
        label: nextFormat.label,
        teamCount: nextFormat.teamCount,
        capacities: nextFormat.capacities
      });
      const teamAssignments = buildBalancedTeams(setupPlayers, nextTeamCodes, nextCapacities);
      const finalSizes = nextTeamCodes.map((team) => ({
        team,
        size: teamAssignments.filter((assignment) => assignment.team === team).length,
        capacity: nextCapacities.get(team) ?? 0
      }));
      console.info("[team-builder] final-sizes", finalSizes);
      setRows((current) =>
        current.map((row) => ({
          ...row,
          team:
            teamAssignments.find((assignment) => assignment.playerId === row.playerId)?.team ?? null,
          groupNumber: null,
          teeTime: null
        }))
      );
      setSelectedSetupPlayerId(null);
      setMessage("Teams balanced.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not build teams for this round.");
    }
  }

  function moveSetupPlayer(playerId: string, destinationTeam: TeamCode) {
    const sourceRow = rows.find((row) => row.playerId === playerId);
    if (!sourceRow?.team || sourceRow.team === destinationTeam) {
      return;
    }

    if (selectedFormat?.isEqual) {
      setMessage("Equal-size team formats only allow swaps. Tap a player on another team to swap.");
      return;
    }

    const currentSizes = new Map(
      setupTeams.map((team) => [team.team, team.players.length])
    );
    const sourceSize = currentSizes.get(sourceRow.team) ?? 0;
    const destinationSize = currentSizes.get(destinationTeam) ?? 0;
    const sourceCapacity = setupTeamCapacities.get(sourceRow.team) ?? 0;
    const destinationCapacity = setupTeamCapacities.get(destinationTeam) ?? 0;

    if (destinationSize >= destinationCapacity || sourceSize <= sourceCapacity) {
      setMessage(
        destinationSize >= destinationCapacity
          ? `Team ${destinationTeam} is full. Tap a player there to swap instead.`
          : formatCapacitySummary(setupTeamCodes, setupTeamCapacities)
      );
      return;
    }

    setRows((current) =>
      current.map((row) =>
        row.playerId === playerId ? { ...row, team: destinationTeam } : row
      )
    );
    setSelectedSetupPlayerId(null);
    setMessage(`Moved player to Team ${destinationTeam}.`);
  }

  function handleSetupPlayerTap(playerId: string) {
    if (!selectedSetupPlayerId) {
      setSelectedSetupPlayerId(playerId);
      setMessage("Player selected. Choose a team below or tap a player on another team to swap.");
      return;
    }

    if (selectedSetupPlayerId === playerId) {
      setSelectedSetupPlayerId(null);
      setMessage("");
      return;
    }

    const leftRow = rows.find((row) => row.playerId === selectedSetupPlayerId);
    const rightRow = rows.find((row) => row.playerId === playerId);

    if (!leftRow?.team || !rightRow?.team) {
      setSelectedSetupPlayerId(null);
      setMessage("Both players need a team before they can be swapped.");
      return;
    }

    if (leftRow.team === rightRow.team) {
      setMessage("Tap a player on a different team to swap.");
      return;
    }

    setRows((current) =>
      current.map((row) => {
        if (row.playerId === leftRow.playerId) {
          return { ...row, team: rightRow.team };
        }
        if (row.playerId === rightRow.playerId) {
          return { ...row, team: leftRow.team };
        }
        return row;
      })
    );
    setSelectedSetupPlayerId(null);
    setMessage("Players swapped.");
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
      return;
    }

    startTransition(async () => {
      try {
        await persistRound();
        setSavedRows(rows.map((row) => ({ ...row, holeScores: [...row.holeScores] })));
        setMessage(messageText);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not save round.");
      }
    });
  }

  function saveSettings() {
    saveRound("Round details saved.");
  }

  function completeRound() {
    if (invalidSequence) {
      setMessage("Finish holes in order before completing the round.");
      return;
    }

    startTransition(async () => {
      try {
        await persistRound();
        setSavedRows(rows.map((row) => ({ ...row, holeScores: [...row.holeScores] })));
        const response = await fetch(`/api/rounds/${round.id}/complete`, {
          method: "POST"
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error ?? "Could not complete round.");
        }
        setMessage(
          isTestRound
            ? "Test round completed. Player quotas were not updated."
            : "Round completed."
        );
        router.push(`/rounds/${round.id}/results`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not complete round.");
      }
    });
  }

  function startGame() {
    let count = 0;
    let nextRows: RowState[] = [];
    let now = "";

    try {
      count = isSkinsOnly ? 0 : selectedFormat?.teamCount ?? 0;

      if (rows.length === 0) {
        setMessage("Add players before starting the game.");
        return;
      }
      if (!isSkinsOnly && (Number.isNaN(count) || count < 2 || count > teamOptions.length)) {
        setMessage("Choose a valid team format before starting.");
        return;
      }
      if (!setupValidation.valid) {
        throw new Error(
          setupValidation.reason || formatCapacitySummary(setupTeamCodes, setupTeamCapacities)
        );
      }

      if (!isSkinsOnly && activeSetupFormat) {
        console.info("[team-builder] start-validation", {
          label: activeSetupFormat.label,
          capacities: activeSetupFormat.capacities,
          sizes: setupTeams.map((team) => ({
            team: team.team,
            size: team.players.length,
            capacity: team.capacity
          }))
        });
      }

      nextRows = rows.map((row) => ({
        ...row,
        team: isSkinsOnly ? null : row.team,
        groupNumber: null,
        teeTime: null
      }));
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
        setShowSetup(false);
        setSelectedTeam(null);
        setActiveTab("round");
        setMessage(isSkinsOnly ? "Skins game ready for live scoring." : "Round locked and ready for live scoring.");
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
  const availableTeams = useMemo(
    () => teamStandings.map((team) => team.team),
    [teamStandings]
  );

  function openTeam(team: TeamCode) {
    const nextHole = getSuggestedHole(teamRowsByCode.get(team) ?? []);
    setMessage("");
    setSelectedTeam(team);
    setActiveHoleByTeam((current) => ({
      ...current,
      [team]: current[team] ?? nextHole
    }));
  }

  function openSkinsEntry() {
    const nextHole = getSuggestedHole(calculatedRows);
    setMessage("");
    setSkinsEntryOpen(true);
    setSkinsActiveHole(nextHole);
  }

  function viewLeaders() {
    setSelectedTeam(null);
    setSkinsEntryOpen(false);
    setActiveTab("leaders");
  }

  function setActiveHole(team: TeamCode, hole: number) {
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
      return;
    }

    if (holeNumber === 18) {
      const wantsReview = window.confirm(
        "Would you like to double-check your scores?\n\nPress OK for Yes, or Cancel for No."
      );

      if (wantsReview) {
        startTransition(async () => {
          try {
            const skinToastMessage = getSkinToastMessage(savedSideGames.skins, sideGames.skins, calculatedRows);
            await persistRound();
            setSavedRows(rows.map((row) => ({ ...row, holeScores: [...row.holeScores] })));
            setSkinsEntryOpen(false);
            setActiveTab("round");
            setToast(skinToastMessage ?? "Hole 18 saved");
            setMessage("Scores saved. Review the round before submitting when you're ready.");
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Could not save skins scores.");
          }
        });
        return;
      }

      const shouldSubmit = window.confirm(
        "Are you sure you want to submit this round?\n\nPress OK to Submit Round, or Cancel to keep reviewing."
      );

      if (!shouldSubmit) {
        setMessage("Round submission canceled.");
        return;
      }

      completeRound();
      return;
    }

    const nextHole = Math.min(18, holeNumber + 1);

    startTransition(async () => {
      try {
        const skinToastMessage = getSkinToastMessage(savedSideGames.skins, sideGames.skins, calculatedRows);
        await persistRound();
        setSavedRows(rows.map((row) => ({ ...row, holeScores: [...row.holeScores] })));
        setSkinsActiveHole(nextHole);
        setToast(skinToastMessage ?? "Hole saved");
        setMessage("");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not save skins scores.");
      }
    });
  }

  function saveTeamHole(team: TeamCode) {
    const teamRows = teamRowsByCode.get(team) ?? [];
    const holeNumber = activeHoleByTeam[team] ?? getSuggestedHole(teamRows);
    const holeIndex = holeNumber - 1;

    if (!teamRows.length) {
      setMessage(`Team ${team} has no players.`);
      return;
    }

    if (teamRows.some((row) => row.holeScores[holeIndex] == null)) {
      setMessage(`Enter a score for every Team ${team} player on hole ${holeNumber}.`);
      return;
    }

    if (invalidSequence) {
      setMessage("Finish holes in order before saving.");
      return;
    }

    if (holeNumber === 18) {
      if (!completedRound) {
        startTransition(async () => {
          try {
            const skinToastMessage = getSkinToastMessage(savedSideGames.skins, sideGames.skins, calculatedRows);
            await persistRound();
            setSavedRows(rows.map((row) => ({ ...row, holeScores: [...row.holeScores] })));
            setSelectedTeam(null);
            setActiveTab("round");
            setToast(skinToastMessage ?? "Hole 18 saved");
            setMessage(`Team ${team} is complete. Finish the remaining teams before submitting the round.`);
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Could not save team scores.");
          }
        });
        return;
      }

      const wantsReview = window.confirm(
        "Would you like to double-check your scores?\n\nPress OK for Yes, or Cancel for No."
      );

      if (wantsReview) {
        startTransition(async () => {
          try {
            const skinToastMessage = getSkinToastMessage(savedSideGames.skins, sideGames.skins, calculatedRows);
            await persistRound();
            setSavedRows(rows.map((row) => ({ ...row, holeScores: [...row.holeScores] })));
            setSelectedTeam(null);
            setActiveTab("round");
            setToast(skinToastMessage ?? "Hole 18 saved");
            setMessage("Scores saved. Review the round before submitting when you're ready.");
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Could not save team scores.");
          }
        });
        return;
      }

      const shouldSubmit = window.confirm(
        "Are you sure you want to submit this round?\n\nPress OK to Submit Round, or Cancel to keep reviewing."
      );

      if (!shouldSubmit) {
        setMessage("Round submission canceled.");
        return;
      }

      completeRound();
      return;
    }

    const nextHole = Math.min(18, holeNumber + 1);

    startTransition(async () => {
      try {
        const skinToastMessage = getSkinToastMessage(savedSideGames.skins, sideGames.skins, calculatedRows);
        await persistRound();
        setSavedRows(rows.map((row) => ({ ...row, holeScores: [...row.holeScores] })));
        setActiveHoleByTeam((current) => ({
          ...current,
          [team]: nextHole
        }));
        setToast(skinToastMessage ?? "Hole saved");
        setMessage("");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not save team scores.");
      }
    });
  }

  function goToPreviousHole(team: TeamCode) {
    const currentHole = activeHoleByTeam[team] ?? getSuggestedHole(teamRowsByCode.get(team) ?? []);
    setActiveHoleByTeam((current) => ({
      ...current,
      [team]: Math.max(1, currentHole - 1)
    }));
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
        isPending={isPending}
        canGoBack={canGoBack}
        canSaveHole={canSaveHole}
        onUpdateHole={updateHole}
        onPreviousHole={() => setSkinsActiveHole((current) => Math.max(1, current - 1))}
        onSaveHole={saveSkinsHole}
        onViewLeaders={viewLeaders}
        onSelectHole={(hole) => setSkinsActiveHole(Math.max(1, Math.min(18, hole)))}
        onBackToRound={() => setSkinsEntryOpen(false)}
      />
    );
  }

  if (selectedTeam) {
    const teamRows = teamRowsByCode.get(selectedTeam) ?? [];
    const activeHole = activeHoleByTeam[selectedTeam] ?? getSuggestedHole(teamRows);
    const activeHoleIndex = activeHole - 1;
    const teamStanding = teamStandings.find((team) => team.team === selectedTeam) ?? null;
    const canGoBack = activeHole > 1;
    const canSaveHole =
      teamRows.length > 0 && teamRows.every((row) => row.holeScores[activeHoleIndex] != null);

    return (
      <TeamScoreEntry
        team={selectedTeam}
        isTestRound={isTestRound}
        activeHole={activeHole}
        rows={teamRows}
        teamStanding={teamStanding}
        playersById={playersById}
        message={message}
        toast={toast}
        isPending={isPending}
        canGoBack={canGoBack}
        canSaveHole={canSaveHole}
        availableTeams={availableTeams}
        onUpdateHole={updateHole}
        onPreviousHole={goToPreviousHole}
        onSaveHole={saveTeamHole}
        onViewLeaders={viewLeaders}
        onSelectHole={setActiveHole}
        onSwitchTeam={switchTeam}
        onBackToTeams={() => setSelectedTeam(null)}
      />
    );
  }

  return (
    <div className="space-y-4 pb-32">
      {!isLocked ? (
        <PageTitle
          title={round.completedAt ? "Round Review" : "Round Setup"}
          subtitle="Pick the field, lock the round, build teams, then start scoring."
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

      {isTestRound ? (
        <div className="px-1">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#F2C5B8] bg-[#FFF4F1] px-4 py-3">
            <TestRoundBadge />
            <p className="text-sm font-medium text-ink/70">
              Scores, leaders, skins, and results work normally, but player quotas will not update when this round is completed.
            </p>
          </div>
        </div>
      ) : null}

      {!isLocked ? (
        <>
          <SectionCard className="space-y-4">
            <div className="rounded-2xl bg-canvas px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Selected Mode</p>
              <p className="mt-1 text-base font-semibold">
                {isSkinsOnly ? "Skins Only Game" : "Match + Quota Game"}
              </p>
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
                  onClick={() => setGameMode("MATCH_QUOTA")}
                >
                  Match + Quota
                </button>
                <button
                  type="button"
                  className={classNames(
                    "min-h-12 rounded-2xl border px-4 text-sm font-semibold",
                    isSkinsOnly ? "border-pine bg-pine text-white" : "border-ink/10 bg-canvas text-ink"
                  )}
                  onClick={() => setGameMode("SKINS_ONLY")}
                >
                  Skins Only
                </button>
              </div>
            </div>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">Round date</span>
              <input type="date" className="h-14 w-full rounded-2xl border border-ink/10 bg-canvas px-4 text-base outline-none" value={roundDate} onChange={(event) => setRoundDate(event.target.value)} />
            </label>
            <p className="text-sm text-ink/65">{`Round name will be ${derivedRoundName}`}</p>
            <label className="flex items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-canvas px-4 py-3">
              <span>
                <span className="block text-sm font-semibold">Test Round</span>
                <span className="mt-1 block text-xs text-ink/60">
                  Play a full round without changing player quotas when it finishes.
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
              <textarea rows={2} className="w-full rounded-2xl border border-ink/10 bg-canvas px-4 py-3 text-base outline-none" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
          </SectionCard>

          <SectionCard className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold">Add Players</h3>
              <p className="mt-1 text-sm text-ink/65">Regular and active players stay at the top for quicker setup.</p>
            </div>
            <input className="h-14 w-full rounded-2xl border border-ink/10 bg-canvas px-4 text-base outline-none" placeholder="Search players" value={search} onChange={(event) => setSearch(event.target.value)} />
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {filteredPlayers.map((player) => (
                <button key={player.id} type="button" className="flex min-h-16 w-full items-center justify-between rounded-[22px] bg-canvas px-4 text-left" onClick={() => addPlayer(player.id)}>
                  <span>
                    <span className="block text-base font-semibold">{player.name}</span>
                    <span className="mt-1 block text-sm text-ink/55">{`Quota ${quotaSnapshot[player.id] ?? player.currentQuota} | ${player.isRegular ? "Regular" : "Other"}`}</span>
                  </span>
                  <span className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-pine">Add</span>
                </button>
              ))}
            </div>
          </SectionCard>

          {rows.length ? (
            <SectionCard className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Selected Players</h3>
                  <p className="mt-1 text-sm text-ink/60">{`${rows.length} in the field`}</p>
                </div>
                <button type="button" className="rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white" onClick={() => setShowSetup((current) => !current)}>
                  {showSetup ? "Hide Lock" : "Lock Round"}
                </button>
              </div>
              <div className="space-y-2">
                {rows.map((row) => {
                  const player = playersById.get(row.playerId);
                  if (!player) return null;
                  return (
                    <div key={row.playerId} className="flex items-center justify-between rounded-2xl bg-canvas px-4 py-3">
                      <div>
                        <p className="text-base font-semibold">{player.name}</p>
                        <p className="mt-1 text-xs text-ink/55">{`Quota ${quotaSnapshot[player.id] ?? player.currentQuota} | Conflicts ${player.conflictIds.length}`}</p>
                      </div>
                      <button type="button" className="min-h-11 rounded-2xl bg-white px-4 text-sm font-semibold text-ink/70" onClick={() => removePlayer(row.playerId)}>
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          ) : null}

          {showSetup && rows.length ? (
            <SectionCard className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Lock Round</p>
                <h3 className="mt-1 text-lg font-semibold">
                  {isSkinsOnly ? "Start the skins game" : "Build teams and start the round"}
                </h3>
              </div>
              {!isSkinsOnly ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-ink">Team Format</p>
                <p className="text-sm text-ink/65">
                  Match mode uses a fixed team-size structure for each supported field size. Balancing happens inside those exact capacities.
                </p>
                {!activeSetupFormat ? (
                  <div className="rounded-2xl border border-ink/10 bg-canvas px-4 py-3 text-sm text-ink/65">
                    Match mode supports fixed team formats for 4 players and for 6 through 16 players. Two-man teams are only allowed for the special 4-player format.
                  </div>
                ) : (
                  <div className="rounded-2xl border border-pine/20 bg-[#E2F4E6] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-pine">{`Team Format: ${activeSetupFormat.capacities.join(",")}`}</p>
                      <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-pine">
                        Fixed
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-ink/70">{setupFormatTeamLabels.join(" | ")}</p>
                    <p className="mt-2 text-sm font-medium text-ink">{activeSetupFormat.label}</p>
                    <p className="mt-2 text-sm font-medium text-ink">
                      {activeSetupFormat.estimatedSpread == null
                        ? "Fairness unavailable"
                        : `Estimated fairness gap ${activeSetupFormat.estimatedSpread}`}
                    </p>
                    <p className="mt-1 text-xs text-ink/65">
                      This player count uses one fixed Match format. Teams are balanced by quota only within these exact capacities.
                    </p>
                  </div>
                )}
              </div>
              ) : (
                <div className="rounded-2xl border border-pine/20 bg-[#E2F4E6] px-4 py-3">
                  <p className="text-sm font-semibold text-pine">Skins Only Game</p>
                  <p className="mt-1 text-xs text-ink/65">
                    Team format and quota setup are skipped. Add players and start scoring skins.
                  </p>
                </div>
              )}
              <div className="flex gap-2">
                {!isSkinsOnly ? (
                  <button
                    type="button"
                    disabled={isPending || !activeSetupFormat}
                    className="min-h-12 flex-1 rounded-2xl bg-canvas px-4 text-sm font-semibold text-ink disabled:opacity-60"
                    onClick={() => autoBuildTeams(activeSetupFormat)}
                  >
                    Regenerate Teams
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={isPending}
                  className={classNames(
                    "min-h-12 rounded-2xl bg-danger/12 px-4 text-sm font-semibold text-danger disabled:opacity-60",
                    isSkinsOnly ? "w-full" : ""
                  )}
                  onClick={deleteRound}
                >
                  {isTestRound ? "Delete Test Round" : "Delete Round"}
                </button>
              </div>
              {!isSkinsOnly ? (
                <>
              <p className="text-sm text-ink/65">
                Equal team sizes are enforced first. Current quota balance is optimized after sizing is valid.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-canvas px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Quota Gap</p>
                  <p className="mt-1 text-xl font-semibold">{setupQuotaSpread}</p>
                </div>
                <div className="rounded-2xl bg-canvas px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Selected Format</p>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    {selectedFormat?.label ?? "Choose a format"}
                  </p>
                  {selectedFormat ? (
                    <p className="mt-1 text-xs text-ink/55">{`Estimated fairness gap ${selectedFormat.estimatedSpread}`}</p>
                  ) : null}
                </div>
              </div>
              <div className="space-y-3">
                {setupTeams.map((team) => (
                  <div key={team.team} className="rounded-[22px] bg-canvas px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold">{`Team ${team.team}`}</p>
                        <p className="mt-1 text-sm text-ink/60">{`${team.players.length} of ${team.capacity} players`}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={classNames(
                            "rounded-full px-3 py-1.5 text-xs font-semibold",
                            team.players.length >= team.capacity
                              ? "bg-[#E2F4E6] text-pine"
                              : "bg-white text-ink/70"
                          )}
                        >
                          {team.players.length >= team.capacity ? "Full" : `${team.capacity - team.players.length} open`}
                        </span>
                        <div className="rounded-2xl bg-white px-4 py-3 text-center">
                          <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Total Quota</p>
                          <p className="mt-1 text-xl font-semibold">{team.totalQuota}</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {team.players.map((player) => {
                        const isSelected = selectedSetupPlayerId === player.playerId;
                        return (
                          <button
                            key={player.playerId}
                            type="button"
                            className={classNames(
                              "w-full rounded-2xl px-4 py-3 text-left",
                              isSelected ? "bg-ink text-white" : "bg-white text-ink"
                            )}
                            onClick={() => handleSetupPlayerTap(player.playerId)}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-base font-semibold">{player.playerName}</p>
                                <p className={classNames("mt-1 text-xs", isSelected ? "text-white/75" : "text-ink/55")}>
                                  {`Quota ${player.quota}`}
                                </p>
                              </div>
                              <span className={classNames("rounded-full px-3 py-1.5 text-xs font-semibold", isSelected ? "bg-white text-ink" : "bg-canvas text-ink/70")}>
                                {isSelected ? "Selected" : "Tap To Swap"}
                              </span>
                            </div>
                            {isSelected ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {setupTeamCodes
                                  .filter((targetTeam) => targetTeam !== team.team)
                                  .map((targetTeam) => (
                                    (() => {
                                      const target = setupTeams.find((candidate) => candidate.team === targetTeam);
                                      const targetIsFull =
                                        (target?.players.length ?? 0) >= (target?.capacity ?? 0);

                                      return (
                                    <button
                                      key={targetTeam}
                                      type="button"
                                      disabled={targetIsFull}
                                      className={classNames(
                                        "min-h-10 rounded-full px-3 text-xs font-semibold",
                                        targetIsFull
                                          ? "bg-ink/10 text-ink/35"
                                          : "bg-white text-ink"
                                      )}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        moveSetupPlayer(player.playerId, targetTeam);
                                      }}
                                    >
                                      {targetIsFull ? `Team ${targetTeam} Full` : `Move to ${targetTeam}`}
                                    </button>
                                      );
                                    })()
                                  ))}
                              </div>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
                </>
              ) : null}
              {message ? <p className="text-sm font-medium text-pine">{message}</p> : null}
              {!setupValidation.valid && rows.length > 0 ? (
                <p className="text-sm font-medium text-[#A53B2A]">
                  {setupValidation.reason || "Teams must have equal players before starting."}
                </p>
              ) : null}
              <button
                type="button"
                disabled={isPending || !canStartConfiguredRound}
                className="min-h-14 w-full rounded-[24px] bg-ink px-5 text-base font-semibold text-white disabled:opacity-60"
                onClick={startGame}
              >
                {isPending ? "Starting round..." : isSkinsOnly ? "Start Skins Game" : "Start Match Game"}
              </button>
            </SectionCard>
          ) : null}
        </>
      ) : (
        <>
          <nav className="fixed bottom-4 left-1/2 z-30 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-[28px] border border-white/80 bg-white/96 p-2 shadow-card backdrop-blur">
            <div className="grid grid-cols-4 gap-2">
              {roundTabs.map((tab) => (
                <button key={tab.id} type="button" onClick={() => { setActiveTab(tab.id); setSelectedTeam(null); }} className={classNames("min-h-14 rounded-[22px] px-2 text-sm font-semibold transition", activeTab === tab.id ? "bg-ink text-white" : "bg-canvas text-ink")}>
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>

          {activeTab === "round" ? (
            isSkinsOnly ? (
              <SkinsOnlyRoundTab rows={calculatedRows} sideGames={sideGames} isTestRound={isTestRound} onDeleteRound={deleteRound} onOpenEntry={openSkinsEntry} />
            ) : (
              <RoundTabView rows={calculatedRows} teamStandings={teamStandings} teamRowsByCode={teamRowsByCode} sideGames={sideGames} isTestRound={isTestRound} onDeleteRound={deleteRound} onOpenTeam={openTeam} />
            )
          ) : null}
          {activeTab === "leaders" ? (
            isSkinsOnly ? (
              <SkinsOnlyLeadersTab sideGames={sideGames} projections={liveProjections} onOpenRound={() => setActiveTab("round")} />
            ) : (
              <LeadersTab rows={calculatedRows} leaders={liveLeaders} projections={liveProjections} teamStandings={teamStandings} sideGames={sideGames} onOpenRound={() => setActiveTab("round")} />
            )
          ) : null}
          {activeTab === "players" ? <PlayersTab rows={calculatedRows} leaders={liveLeaders} sideGames={sideGames} mode={gameMode} /> : null}
          {activeTab === "settings" ? <SettingsTab roundId={round.id} roundName={derivedRoundName} roundDate={roundDate} notes={notes} isTestRound={isTestRound} setRoundDate={setRoundDate} setNotes={setNotes} setIsTestRound={setIsTestRound} sideGames={sideGames} isPending={isPending} isStarted={Boolean(startedAt || lockedAt)} hasSavedScores={hasSavedScores} onSave={saveSettings} onCompleteRound={completeRound} onDeleteRound={deleteRound} onForceDeleteRound={forceDeleteRound} /> : null}
        </>
      )}

      {message && !selectedTeam && !showSetup ? <p className="px-2 text-center text-sm font-medium text-pine">{message}</p> : null}
    </div>
  );
}

function TeamScoreEntry({
  team,
  isTestRound,
  activeHole,
  rows,
  teamStanding,
  playersById,
  message,
  toast,
  isPending,
  canGoBack,
  canSaveHole,
  availableTeams,
  onUpdateHole,
  onPreviousHole,
  onSaveHole,
  onViewLeaders,
  onSelectHole,
  onSwitchTeam,
  onBackToTeams
}: {
  team: TeamCode;
  isTestRound: boolean;
  activeHole: number;
  rows: CalculatedRoundRow[];
  teamStanding: TeamStanding | null;
  playersById: Map<string, PlayerOption>;
  message: string;
  toast: string;
  isPending: boolean;
  canGoBack: boolean;
  canSaveHole: boolean;
  availableTeams: TeamCode[];
  onUpdateHole: (playerId: string, holeIndex: number, value: number) => void;
  onPreviousHole: (team: TeamCode) => void;
  onSaveHole: (team: TeamCode) => void;
  onViewLeaders: () => void;
  onSelectHole: (team: TeamCode, hole: number) => void;
  onSwitchTeam: (direction: -1 | 1) => void;
  onBackToTeams: () => void;
}) {
  const activeHoleIndex = activeHole - 1;
  const isFinalHole = activeHole === 18;

  return (
    <div className="space-y-4 pb-32">
      <PageTitle
        title={`Team ${team} Score Entry`}
        subtitle={isTestRound ? `Hole ${activeHole} of 18 · Test round` : `Hole ${activeHole} of 18`}
        action={
          <button type="button" onClick={onBackToTeams} className="rounded-2xl bg-canvas px-4 py-3 text-sm font-semibold text-ink">
            Back To Teams
          </button>
        }
      />

      {isTestRound ? (
        <div className="px-1">
          <TestRoundBadge subtle />
        </div>
      ) : null}

      <SectionCard className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Live Entry</p>
            <h3 className="mt-1 text-2xl font-semibold">{`Team ${team}`}</h3>
            <p className="mt-1 text-sm text-ink/60">
              {isFinalHole
                ? "Tap one score per player, then review and submit the round when you are ready."
                : "Tap one score per player. Save moves this team to the next hole."}
            </p>
          </div>
          <div className="rounded-[22px] bg-canvas px-4 py-3 text-right">
            <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Hole</p>
            <p className="mt-1 text-3xl font-semibold">{`${activeHole}/18`}</p>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {holeNumbers.map((holeNumber) => (
            <button
              key={holeNumber}
              type="button"
              onClick={() => onSelectHole(team, holeNumber)}
              className={classNames(
                "min-h-12 min-w-12 rounded-2xl px-3 text-sm font-semibold",
                holeNumber === activeHole ? "bg-ink text-white" : "bg-canvas text-ink"
              )}
            >
              {holeNumber}
            </button>
          ))}
        </div>
      </SectionCard>

      <div className="space-y-3">
        {rows.map((row) => {
          const player = playersById.get(row.playerId);

          return (
            <SectionCard key={row.playerId} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold leading-tight">{row.playerName}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-full bg-canvas px-3 py-1.5 text-xs font-semibold text-ink/70">{`Total ${row.totalPoints}`}</span>
                    <span className={classNames("rounded-full px-3 py-1.5 text-xs font-semibold", row.plusMinus < 0 ? "bg-[#FCE5E2] text-danger" : "bg-[#E2F4E6] text-pine")}>
                      {formatPlusMinus(row.plusMinus)}
                    </span>
                    <span className="rounded-full bg-canvas px-3 py-1.5 text-xs font-semibold text-ink/70">{`Next ${row.nextQuota}`}</span>
                  </div>
                </div>
                <div className="rounded-2xl bg-canvas px-4 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">{`Hole ${activeHole}`}</p>
                  <p className="mt-1 text-2xl font-semibold">{row.holeScores[activeHoleIndex] ?? "-"}</p>
                </div>
              </div>

              <ScoreButtonGroup value={row.holeScores[activeHoleIndex]} onSelect={(value) => onUpdateHole(row.playerId, activeHoleIndex, value)} />
              {player ? <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink/45">{player.isRegular ? "Regular player" : "Other player"}</p> : null}
            </SectionCard>
          );
        })}
      </div>

      {teamStanding ? <TeamSummaryMini frontPoints={teamStanding.frontPoints} backPoints={teamStanding.backPoints} totalPoints={teamStanding.totalPoints} totalQuota={teamStanding.totalQuota} totalPlusMinus={teamStanding.totalPlusMinus} /> : null}

      <div className="fixed bottom-4 left-1/2 z-30 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-[28px] border border-white/80 bg-white/96 p-3 shadow-card backdrop-blur">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onPreviousHole(team)} disabled={isPending || !canGoBack} className="min-h-14 rounded-[22px] border border-ink/10 bg-canvas px-4 text-base font-semibold text-ink disabled:opacity-45">
            Previous Hole
          </button>
          <button type="button" onClick={() => onSaveHole(team)} disabled={isPending || !canSaveHole} className="min-h-14 rounded-[22px] bg-ink px-4 text-base font-semibold text-white disabled:opacity-45">
            {isPending ? (isFinalHole ? "Working..." : "Saving...") : isFinalHole ? "Submit Final Score" : "Save + Next Hole"}
          </button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" onClick={onViewLeaders} className="min-h-12 rounded-[22px] border border-ink/10 bg-canvas px-4 text-sm font-semibold text-ink">
            View Leaders
          </button>
          <button type="button" onClick={onBackToTeams} className="min-h-12 rounded-[22px] border border-ink/10 bg-canvas px-4 text-sm font-semibold text-ink">
            Back To Teams
          </button>
        </div>
        {availableTeams.length > 1 ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onSwitchTeam(-1)} className="min-h-12 rounded-[22px] border border-ink/10 bg-canvas px-4 text-sm font-semibold text-ink">
              Previous Team
            </button>
            <button type="button" onClick={() => onSwitchTeam(1)} className="min-h-12 rounded-[22px] border border-ink/10 bg-canvas px-4 text-sm font-semibold text-ink">
              Next Team
            </button>
          </div>
        ) : null}
        {toast ? <p className="mt-2 text-center text-sm font-semibold text-pine">{toast}</p> : null}
        {message ? <p className="mt-1 text-center text-xs font-medium text-ink/60">{message}</p> : null}
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
        {teamStandings.map((team) => (
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
  rows,
  teamStandings,
  teamRowsByCode,
  sideGames,
  isTestRound,
  onDeleteRound,
  onOpenTeam
}: {
  rows: CalculatedRoundRow[];
  teamStandings: TeamStanding[];
  teamRowsByCode: Map<TeamCode, CalculatedRoundRow[]>;
  sideGames: SideGameResults;
  isTestRound: boolean;
  onDeleteRound: () => void;
  onOpenTeam: (team: TeamCode) => void;
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

      <div className="space-y-3">
        {teamStandings.map((team) => {
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
                      <span aria-hidden="true">✔</span>
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
  rows,
  sideGames,
  isTestRound,
  onDeleteRound,
  onOpenEntry
}: {
  rows: CalculatedRoundRow[];
  sideGames: SideGameResults;
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
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Skins Only</p>
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
                      <span aria-hidden="true">✔</span>
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
  isPending,
  canGoBack,
  canSaveHole,
  onUpdateHole,
  onPreviousHole,
  onSaveHole,
  onViewLeaders,
  onSelectHole,
  onBackToRound
}: {
  isTestRound: boolean;
  activeHole: number;
  rows: CalculatedRoundRow[];
  message: string;
  toast: string;
  isPending: boolean;
  canGoBack: boolean;
  canSaveHole: boolean;
  onUpdateHole: (playerId: string, holeIndex: number, value: number) => void;
  onPreviousHole: () => void;
  onSaveHole: () => void;
  onViewLeaders: () => void;
  onSelectHole: (hole: number) => void;
  onBackToRound: () => void;
}) {
  const activeHoleIndex = activeHole - 1;
  const isFinalHole = activeHole === 18;

  return (
    <div className="space-y-4 pb-32">
      <PageTitle
        title="Skins Score Entry"
        subtitle={isTestRound ? `Hole ${activeHole} of 18 · Test round` : `Hole ${activeHole} of 18`}
        action={
          <button type="button" onClick={onBackToRound} className="rounded-2xl bg-canvas px-4 py-3 text-sm font-semibold text-ink">
            Back To Round
          </button>
        }
      />

      {isTestRound ? (
        <div className="px-1">
          <TestRoundBadge subtle />
        </div>
      ) : null}

      <SectionCard className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Live Entry</p>
            <h3 className="mt-1 text-2xl font-semibold">Skins Only</h3>
            <p className="mt-1 text-sm text-ink/60">
              {isFinalHole
                ? "Tap one score per player, then review and submit the round when you are ready."
                : "Tap one score per player. Save moves the game to the next hole."}
            </p>
          </div>
          <div className="rounded-[22px] bg-canvas px-4 py-3 text-right">
            <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Hole</p>
            <p className="mt-1 text-3xl font-semibold">{`${activeHole}/18`}</p>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {holeNumbers.map((holeNumber) => (
            <button
              key={holeNumber}
              type="button"
              onClick={() => onSelectHole(holeNumber)}
              className={classNames(
                "min-h-12 min-w-12 rounded-2xl px-3 text-sm font-semibold",
                holeNumber === activeHole ? "bg-ink text-white" : "bg-canvas text-ink"
              )}
            >
              {holeNumber}
            </button>
          ))}
        </div>
      </SectionCard>

      <div className="space-y-3">
        {rows.map((row) => (
          <SectionCard key={row.playerId} className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold leading-tight">{row.playerName}</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full bg-canvas px-3 py-1.5 text-xs font-semibold text-ink/70">{`Total ${row.totalPoints}`}</span>
                  <span className="rounded-full bg-canvas px-3 py-1.5 text-xs font-semibold text-ink/70">{`Front ${row.frontNine}`}</span>
                  <span className="rounded-full bg-canvas px-3 py-1.5 text-xs font-semibold text-ink/70">{`Back ${row.backNine}`}</span>
                </div>
              </div>
              <div className="rounded-2xl bg-canvas px-4 py-3 text-center">
                <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">{`Hole ${activeHole}`}</p>
                <p className="mt-1 text-2xl font-semibold">{row.holeScores[activeHoleIndex] ?? "-"}</p>
              </div>
            </div>
            <ScoreButtonGroup value={row.holeScores[activeHoleIndex]} onSelect={(value) => onUpdateHole(row.playerId, activeHoleIndex, value)} />
          </SectionCard>
        ))}
      </div>

      <div className="fixed bottom-4 left-1/2 z-30 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-[28px] border border-white/80 bg-white/96 p-3 shadow-card backdrop-blur">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onPreviousHole} disabled={isPending || !canGoBack} className="min-h-14 rounded-[22px] border border-ink/10 bg-canvas px-4 text-base font-semibold text-ink disabled:opacity-45">
            Previous Hole
          </button>
          <button type="button" onClick={onSaveHole} disabled={isPending || !canSaveHole} className="min-h-14 rounded-[22px] bg-ink px-4 text-base font-semibold text-white disabled:opacity-45">
            {isPending ? (isFinalHole ? "Working..." : "Saving...") : isFinalHole ? "Submit Final Score" : "Save + Next Hole"}
          </button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" onClick={onViewLeaders} className="min-h-12 rounded-[22px] border border-ink/10 bg-canvas px-4 text-sm font-semibold text-ink">
            View Leaders
          </button>
          <button type="button" onClick={onBackToRound} className="min-h-12 rounded-[22px] border border-ink/10 bg-canvas px-4 text-sm font-semibold text-ink">
            Back To Round
          </button>
        </div>
        {toast ? <p className="mt-2 text-center text-sm font-semibold text-pine">{toast}</p> : null}
        {message ? <p className="mt-1 text-center text-xs font-medium text-ink/60">{message}</p> : null}
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
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">Skins Only</p>
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
                    <span aria-hidden="true">✔</span>
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
