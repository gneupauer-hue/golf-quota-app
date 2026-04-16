import type { TeamCode } from "@/lib/quota";

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

function buildSnakeSequence(teamCodes: TeamCode[], capacities: Map<TeamCode, number>) {
  const sequence: TeamCode[] = [];
  let direction: 1 | -1 = 1;
  const remainingCapacities = new Map(capacities);
  const totalPlayers = Array.from(remainingCapacities.values()).reduce(
    (sum, value) => sum + value,
    0
  );

  while (sequence.length < totalPlayers) {
    const pass =
      direction === 1 ? teamCodes : [...teamCodes].reverse();

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

function optimizeAssignments(
  assignments: TeamAssignment[],
  players: SetupPlayer[],
  teamCodes: TeamCode[],
  conflictMap: Map<string, Set<string>>
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

        const trialState = hydrateTeamState(trialAssignments, players, teamCodes);
        const nextConflicts = teamConflictCount(trialState, conflictMap);
        const nextSpread = teamBalanceSpread(trialState);

        if (
          nextConflicts < currentConflicts ||
          (nextConflicts === currentConflicts && nextSpread < currentSpread)
        ) {
          assignments[leftIndex].team = right.team;
          assignments[rightIndex].team = left.team;
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
  teamCount: number
): TeamAssignment[] {
  const teamCodes = ["A", "B", "C", "D", "E"].slice(0, teamCount) as TeamCode[];
  const teamCapacities = buildTeamCapacities(teamCodes, players.length);
  const sortedPlayers = [...players].sort(
    (a, b) => b.quota - a.quota || a.playerName.localeCompare(b.playerName)
  );
  const snakeSequence = buildSnakeSequence(teamCodes, teamCapacities);
  const conflictMap = buildConflictMap(sortedPlayers);
  const teamState = createTeamState(teamCodes);
  const assignments: TeamAssignment[] = [];

  sortedPlayers.forEach((player, index) => {
    const preferredTeam = snakeSequence[index];
    const teamsWithCapacity = teamCodes.filter(
      (team) => teamState.get(team)!.playerIds.length < (teamCapacities.get(team) ?? 0)
    );
    const fallbackTeams = teamsWithCapacity
      .filter((team) => team !== preferredTeam)
      .sort((left, right) => {
        const leftState = teamState.get(left)!;
        const rightState = teamState.get(right)!;
        if (leftState.playerIds.length !== rightState.playerIds.length) {
          return leftState.playerIds.length - rightState.playerIds.length;
        }
        return leftState.totalQuota - rightState.totalQuota;
      });
    const candidateTeams = [
      ...(teamsWithCapacity.includes(preferredTeam) ? [preferredTeam] : []),
      ...fallbackTeams
    ];

    if (!candidateTeams.length) {
      throw new Error("Could not assign players into valid team sizes.");
    }

    let chosenTeam = candidateTeams.find((team) => {
      const state = teamState.get(team)!;
      return !hasConflict(player.playerId, state.playerIds, conflictMap);
    });

    if (!chosenTeam) {
      chosenTeam = candidateTeams[0];
    }

    const state = teamState.get(chosenTeam)!;
    state.playerIds.push(player.playerId);
    state.totalQuota += player.quota;
    assignments.push({
      playerId: player.playerId,
      team: chosenTeam
    });
  });

  const initialValidation = validateTeamAssignments(assignments, teamCodes, teamCapacities);
  if (!initialValidation.valid) {
    throw new Error("Could not build evenly sized teams for this round.");
  }

  const optimizedAssignments = optimizeAssignments(assignments, sortedPlayers, teamCodes, conflictMap);
  const validation = validateTeamAssignments(optimizedAssignments, teamCodes, teamCapacities);

  if (!validation.valid) {
    return assignments;
  }

  return optimizedAssignments;
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
