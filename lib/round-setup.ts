import { teamOptions, type TeamCode } from "@/lib/quota";

type SetupPlayer = {
  playerId: string;
  playerName: string;
  quota: number;
  conflictIds: string[];
};

type TeamAssignment = {
  playerId: string;
  team: TeamCode;
};

type GroupAssignment = {
  playerId: string;
  groupNumber: number;
  teeTime: string;
};

type TeamState = {
  totalQuota: number;
  playerIds: string[];
};

export type TeamFormat = {
  teamCount: number;
  capacities: number[];
  label: string;
  subtitle: string | null;
  isEqual: boolean;
};

export type EvaluatedTeamFormat = TeamFormat & {
  estimatedSpread: number | null;
};

const debugTeamBuilder = process.env.TEAM_BUILDER_DEBUG === "1";

function logTeamBuilder(level: "info" | "warn", message: string, details: unknown) {
  if (!debugTeamBuilder) {
    return;
  }

  console[level](message, details);
}

export function getPartnerPairKey(leftPlayerId: string, rightPlayerId: string) {
  return [leftPlayerId, rightPlayerId].sort().join("|");
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shufflePlayers(players: SetupPlayer[], variant: number, attempt: number) {
  const rng = createSeededRandom((variant + 1) * 2654435761 + attempt * 1013904223);
  const shuffled = [...players];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

export function getTeamFormatKey(format: Pick<TeamFormat, "teamCount" | "capacities">) {
  return `${format.teamCount}:${format.capacities.join("-")}`;
}

export function capacitiesToMap(teamCodes: TeamCode[], capacities: number[]) {
  return new Map<TeamCode, number>(
    teamCodes.map((team, index) => [team, capacities[index] ?? 0])
  );
}

function rotateTeams(teamCodes: TeamCode[], offset: number) {
  if (!teamCodes.length) {
    return teamCodes;
  }

  const normalizedOffset = ((offset % teamCodes.length) + teamCodes.length) % teamCodes.length;
  return [...teamCodes.slice(normalizedOffset), ...teamCodes.slice(0, normalizedOffset)];
}

function buildSnakeSequence(
  teamCodes: TeamCode[],
  capacities: Map<TeamCode, number>,
  variant = 0
) {
  const sequence: TeamCode[] = [];
  let direction: 1 | -1 = variant % 2 === 0 ? 1 : -1;
  const remainingCapacities = new Map(capacities);
  const rotatedTeams = rotateTeams(teamCodes, variant);
  const totalPlayers = Array.from(remainingCapacities.values()).reduce(
    (sum, value) => sum + value,
    0
  );

  while (sequence.length < totalPlayers) {
    const pass =
      direction === 1 ? rotatedTeams : [...rotatedTeams].reverse();

    for (const team of pass) {
      const remaining = remainingCapacities.get(team) ?? 0;
      if (remaining <= 0) {
        continue;
      }

      sequence.push(team);
      remainingCapacities.set(team, remaining - 1);
    }

    direction = direction === 1 ? -1 : 1;
  }

  return sequence;
}

export function buildConflictMap(players: SetupPlayer[]) {
  return new Map(players.map((player) => [player.playerId, new Set(player.conflictIds)]));
}

function hasConflict(
  playerId: string,
  otherIds: string[],
  conflictMap: Map<string, Set<string>>
) {
  const conflicts = conflictMap.get(playerId) ?? new Set<string>();
  return otherIds.some((id) => conflicts.has(id));
}

function createTeamState(teamCodes: TeamCode[]) {
  return new Map<TeamCode, TeamState>(
    teamCodes.map((team) => [
      team,
      {
        totalQuota: 0,
        playerIds: []
      }
    ])
  );
}

function buildTeamCapacities(teamCodes: TeamCode[], playerCount: number) {
  const base = Math.floor(playerCount / teamCodes.length);
  const remainder = playerCount % teamCodes.length;

  return new Map<TeamCode, number>(
    teamCodes.map((team, index) => [team, base + (index < remainder ? 1 : 0)])
  );
}

export function getTeamCapacities(teamCodes: TeamCode[], playerCount: number) {
  return buildTeamCapacities(teamCodes, playerCount);
}

// Single source of truth for supported Match + Quota team formats.
// Each player-count entry can expose one or more explicit valid formats,
// and every setup/build/validation path should read from this map.
export const SUPPORTED_TEAM_FORMATS_MAP = new Map<number, number[][]>([
  [4, [[2, 2]]],
  [6, [[3, 3]]],
  [7, [[3, 4]]],
  [8, [[2, 2, 2, 2], [4, 4]]],
  [9, [[3, 3, 3]]],
  [10, [[2, 2, 2, 2, 2]]],
  [11, [[3, 4, 4]]],
  [12, [[2, 2, 2, 2, 2, 2], [3, 3, 3, 3], [4, 4, 4]]],
  [13, [[3, 3, 3, 4]]],
  [14, [[2, 2, 2, 2, 2, 2, 2], [3, 3, 4, 4]]],
  [15, [[3, 3, 3, 3, 3]]],
  [16, [[2, 2, 2, 2, 2, 2, 2, 2], [4, 4, 4, 4]]]
]);

function formatTeamCountPhrase(count: number, size: number) {
  return `${count} team${count === 1 ? "" : "s"} of ${size}`;
}

function getTeamFormatSubtitle(capacities: number[]) {
  const unique = Array.from(new Set(capacities)).sort((left, right) => left - right);

  if (unique.length !== 1) {
    return null;
  }

  const onlySize = unique[0];
  if (onlySize === 2) return "Pairs";
  if (onlySize === 3) return "Triples";
  if (onlySize === 4) return "Foursomes";
  return null;
}

function formatTeamFormatLabel(capacities: number[]) {
  const countsBySize = new Map<number, number>();
  for (const capacity of capacities) {
    countsBySize.set(capacity, (countsBySize.get(capacity) ?? 0) + 1);
  }

  return Array.from(countsBySize.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([size, count]) => formatTeamCountPhrase(count, size))
    .join(" + ");
}

export function getTeamFormats(playerCount: number) {
  const formats = SUPPORTED_TEAM_FORMATS_MAP.get(playerCount);

  if (!formats) {
    return [] as TeamFormat[];
  }

  return formats.map((capacities) => ({
    teamCount: capacities.length,
    capacities,
    label: formatTeamFormatLabel(capacities),
    subtitle: getTeamFormatSubtitle(capacities),
    isEqual: capacities.every((capacity) => capacity === capacities[0])
  }));
}

function getTeamSizeMap(assignments: TeamAssignment[], teamCodes: TeamCode[]) {
  const sizes = new Map<TeamCode, number>(teamCodes.map((team) => [team, 0]));

  for (const assignment of assignments) {
    sizes.set(assignment.team, (sizes.get(assignment.team) ?? 0) + 1);
  }

  return sizes;
}

export function validateTeamAssignments(
  assignments: TeamAssignment[],
  teamCodes: TeamCode[],
  capacities: Map<TeamCode, number>
) {
  const sizes = getTeamSizeMap(assignments, teamCodes);

  for (const team of teamCodes) {
    if ((sizes.get(team) ?? 0) !== (capacities.get(team) ?? 0)) {
      return {
        valid: false,
        sizes,
        capacities
      } as const;
    }
  }

  return {
    valid: true,
    sizes,
    capacities
  } as const;
}

export function formatCapacitySummary(teamCodes: TeamCode[], capacities: Map<TeamCode, number>) {
  const uniqueCapacities = Array.from(new Set(teamCodes.map((team) => capacities.get(team) ?? 0)));

  if (uniqueCapacities.length === 1) {
    const onlyCapacity = uniqueCapacities[0] ?? 0;
    return `Teams must have ${onlyCapacity} player${onlyCapacity === 1 ? "" : "s"} each.`;
  }

  return `Teams must match the selected format: ${teamCodes
    .map((team) => `${team}:${capacities.get(team) ?? 0}`)
    .join(" | ")}.`;
}

function hydrateTeamState(
  assignments: TeamAssignment[],
  players: SetupPlayer[],
  teamCodes: TeamCode[]
) {
  const state = createTeamState(teamCodes);
  const playerMap = new Map(players.map((player) => [player.playerId, player]));

  for (const assignment of assignments) {
    const player = playerMap.get(assignment.playerId);
    if (!player) {
      continue;
    }

    const team = state.get(assignment.team)!;
    team.playerIds.push(player.playerId);
    team.totalQuota += player.quota;
  }

  return state;
}

function teamConflictCount(
  teamState: Map<TeamCode, TeamState>,
  conflictMap: Map<string, Set<string>>
) {
  let total = 0;

  for (const state of teamState.values()) {
    for (let index = 0; index < state.playerIds.length; index += 1) {
      for (let cursor = index + 1; cursor < state.playerIds.length; cursor += 1) {
        const left = state.playerIds[index];
        const right = state.playerIds[cursor];
        if ((conflictMap.get(left) ?? new Set<string>()).has(right)) {
          total += 1;
        }
      }
    }
  }

  return total;
}

function teamBalanceSpread(teamState: Map<TeamCode, TeamState>) {
  const totals = Array.from(teamState.values()).map((team) => team.totalQuota);
  return Math.max(...totals) - Math.min(...totals);
}

function calculateAssignmentSpread(
  assignments: TeamAssignment[],
  players: SetupPlayer[],
  teamCodes: TeamCode[]
) {
  return teamBalanceSpread(hydrateTeamState(assignments, players, teamCodes));
}

function getTeamRepeatCount(playerIds: string[], partnerCounts: Record<string, number>) {
  let total = 0;

  for (let leftIndex = 0; leftIndex < playerIds.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < playerIds.length; rightIndex += 1) {
      total += partnerCounts[getPartnerPairKey(playerIds[leftIndex], playerIds[rightIndex])] ?? 0;
    }
  }

  return total;
}

function buildRandomTeamsByCapacity(
  players: SetupPlayer[],
  teamCodes: TeamCode[],
  teamCapacities: Map<TeamCode, number>,
  partnerCounts: Record<string, number>,
  variant = 0
) {
  const conflictMap = buildConflictMap(players);
  const candidateCount = Math.max(120, players.length * teamCodes.length * 18);
  let bestAssignments: TeamAssignment[] | null = null;
  let bestScore: {
    repeatCount: number;
    conflictCount: number;
    spread: number;
    randomTieBreaker: number;
  } | null = null;

  for (let attempt = 0; attempt < candidateCount; attempt += 1) {
    const shuffled = shufflePlayers(players, variant, attempt);
    const assignments: TeamAssignment[] = [];
    let repeatCount = 0;
    let conflictCount = 0;
    let cursor = 0;

    for (const team of teamCodes) {
      const capacity = teamCapacities.get(team) ?? 0;
      const teamPlayers = shuffled.slice(cursor, cursor + capacity);
      cursor += capacity;

      if (teamPlayers.length !== capacity) {
        break;
      }

      const teamPlayerIds = teamPlayers.map((player) => player.playerId);
      repeatCount += getTeamRepeatCount(teamPlayerIds, partnerCounts);
      conflictCount += teamConflictCount(
        new Map([[team, { totalQuota: 0, playerIds: teamPlayerIds }]]),
        conflictMap
      );

      for (const player of teamPlayers) {
        assignments.push({ playerId: player.playerId, team });
      }
    }

    if (assignments.length !== players.length) {
      continue;
    }

    const spread = calculateAssignmentSpread(assignments, players, teamCodes);
    const randomTieBreaker = createSeededRandom((variant + 7) * 1103515245 + attempt)();
    const score = {
      repeatCount,
      conflictCount,
      spread,
      randomTieBreaker
    };

    if (
      !bestScore ||
      score.repeatCount < bestScore.repeatCount ||
      (score.repeatCount === bestScore.repeatCount && score.conflictCount < bestScore.conflictCount) ||
      (score.repeatCount === bestScore.repeatCount &&
        score.conflictCount === bestScore.conflictCount &&
        score.randomTieBreaker < bestScore.randomTieBreaker) ||
      (score.repeatCount === bestScore.repeatCount &&
        score.conflictCount === bestScore.conflictCount &&
        score.randomTieBreaker === bestScore.randomTieBreaker &&
        score.spread < bestScore.spread)
    ) {
      bestAssignments = assignments;
      bestScore = score;
    }
  }

  if (!bestAssignments) {
    throw new Error("Could not build valid teams for this round.");
  }

  return bestAssignments;
}

function buildCapacitySafeAssignments(
  players: SetupPlayer[],
  teamCodes: TeamCode[],
  teamCapacities: Map<TeamCode, number>,
  variant = 0
) {
  const sortedPlayers = [...players].sort(
    (a, b) =>
      b.quota - a.quota ||
      (variant % 2 === 0
        ? a.playerName.localeCompare(b.playerName)
        : b.playerName.localeCompare(a.playerName))
  );
  const snakeSequence = buildSnakeSequence(teamCodes, teamCapacities, variant);

  return sortedPlayers.map((player, index) => ({
    playerId: player.playerId,
    team: snakeSequence[index] ?? teamCodes[teamCodes.length - 1]
  }));
}

function optimizeAssignments(
  assignments: TeamAssignment[],
  players: SetupPlayer[],
  teamCodes: TeamCode[],
  conflictMap: Map<string, Set<string>>,
  capacities: Map<TeamCode, number>
) {
  const seenStates = new Set<string>();
  const maxIterations = Math.max(24, assignments.length * teamCodes.length * 4);
  let changed = true;
  let iterations = 0;

  while (changed) {
    iterations += 1;
    if (iterations > maxIterations) {
      break;
    }

    changed = false;
    const stateKey = assignments
      .map((assignment) => `${assignment.playerId}:${assignment.team}`)
      .sort()
      .join("|");

    if (seenStates.has(stateKey)) {
      break;
    }

    seenStates.add(stateKey);
    const currentState = hydrateTeamState(assignments, players, teamCodes);
    const currentConflicts = teamConflictCount(currentState, conflictMap);
    const currentSpread = teamBalanceSpread(currentState);

    outer: for (let leftIndex = 0; leftIndex < assignments.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < assignments.length; rightIndex += 1) {
        const left = assignments[leftIndex];
        const right = assignments[rightIndex];

        if (left.team === right.team) {
          continue;
        }

        const trialAssignments = assignments.map((assignment) => ({ ...assignment }));
        trialAssignments[leftIndex].team = right.team;
        trialAssignments[rightIndex].team = left.team;

        const trialValidation = validateTeamAssignments(trialAssignments, teamCodes, capacities);
        if (!trialValidation.valid) {
          logTeamBuilder("info", "[team-builder] rejected-swap", {
            leftPlayerId: left.playerId,
            leftTeam: left.team,
            rightPlayerId: right.playerId,
            rightTeam: right.team,
            reason: "capacity"
          });
          continue;
        }

        const trialState = hydrateTeamState(trialAssignments, players, teamCodes);
        const nextConflicts = teamConflictCount(trialState, conflictMap);
        const nextSpread = teamBalanceSpread(trialState);
        logTeamBuilder("info", "[team-builder] trial-swap", {
          leftPlayerId: left.playerId,
          leftTeam: left.team,
          rightPlayerId: right.playerId,
          rightTeam: right.team,
          currentSpread,
          nextSpread,
          currentConflicts,
          nextConflicts
        });

        if (
          nextConflicts < currentConflicts ||
          (nextConflicts === currentConflicts && nextSpread < currentSpread)
        ) {
          assignments[leftIndex].team = right.team;
          assignments[rightIndex].team = left.team;
          logTeamBuilder("info", "[team-builder] accepted-swap", {
            leftPlayerId: left.playerId,
            rightPlayerId: right.playerId,
            nextSpread,
            nextConflicts
          });
          changed = true;
          break outer;
        }

      }
    }
  }

  return assignments;
}

export function buildBalancedTeams(
  players: SetupPlayer[],
  teamCodes: TeamCode[],
  teamCapacities: Map<TeamCode, number>,
  options?: {
    variant?: number;
    partnerCounts?: Record<string, number>;
  }
): TeamAssignment[] {
  const variant = options?.variant ?? 0;
  return buildRandomTeamsByCapacity(
    players,
    teamCodes,
    teamCapacities,
    options?.partnerCounts ?? {},
    variant
  );
}

export function evaluateTeamFormat(players: SetupPlayer[], format: TeamFormat) {
  const teamCodes = teamOptions.slice(0, format.teamCount) as TeamCode[];
  const capacities = capacitiesToMap(teamCodes, format.capacities);
  const assignments = buildBalancedTeams(players, teamCodes, capacities);

  return {
    ...format,
    estimatedSpread: calculateAssignmentSpread(assignments, players, teamCodes)
  } satisfies EvaluatedTeamFormat;
}

function buildGroupCapacities(playerCount: number, groupCount: number) {
  const base = Math.floor(playerCount / groupCount);
  const remainder = playerCount % groupCount;
  return Array.from({ length: groupCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function buildGroups(
  players: Array<SetupPlayer & { team: TeamCode }>,
  teeTimes: string[]
): GroupAssignment[] {
  const groupCount = teeTimes.length;

  if (!groupCount) {
    return [];
  }

  const capacities = buildGroupCapacities(players.length, groupCount);
  const conflictMap = buildConflictMap(players);
  const groups = teeTimes.map((teeTime, index) => ({
    groupNumber: index + 1,
    teeTime,
    playerIds: [] as string[],
    teams: new Map<TeamCode, number>()
  }));
  const sortedPlayers = [...players].sort(
    (a, b) => b.quota - a.quota || a.playerName.localeCompare(b.playerName)
  );
  const assignments: GroupAssignment[] = [];

  for (const player of sortedPlayers) {
    const candidates = groups
      .map((group, index) => ({ group, capacity: capacities[index] }))
      .filter(({ group, capacity }) => group.playerIds.length < capacity)
      .sort((left, right) => {
        const leftTeamCount = left.group.teams.get(player.team) ?? 0;
        const rightTeamCount = right.group.teams.get(player.team) ?? 0;
        if (leftTeamCount !== rightTeamCount) {
          return leftTeamCount - rightTeamCount;
        }
        return left.group.playerIds.length - right.group.playerIds.length;
      });

    let chosen = candidates.find(
      ({ group }) => !hasConflict(player.playerId, group.playerIds, conflictMap)
    )?.group;

    if (!chosen) {
      chosen = candidates[0]?.group ?? groups[0];
    }

    chosen.playerIds.push(player.playerId);
    chosen.teams.set(player.team, (chosen.teams.get(player.team) ?? 0) + 1);
    assignments.push({
      playerId: player.playerId,
      groupNumber: chosen.groupNumber,
      teeTime: chosen.teeTime
    });
  }

  return assignments;
}
