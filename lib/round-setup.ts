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

function buildSnakeSequence(teamCodes: TeamCode[], playerCount: number) {
  const sequence: TeamCode[] = [];
  let direction = 1;
  let index = 0;

  while (sequence.length < playerCount) {
    sequence.push(teamCodes[index]);

    if (direction === 1 && index === teamCodes.length - 1) {
      direction = -1;
    } else if (direction === -1 && index === 0) {
      direction = 1;
    } else {
      index += direction;
    }
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
  let changed = true;

  while (changed) {
    changed = false;
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
  const sortedPlayers = [...players].sort(
    (a, b) => b.quota - a.quota || a.playerName.localeCompare(b.playerName)
  );
  const snakeSequence = buildSnakeSequence(teamCodes, sortedPlayers.length);
  const conflictMap = buildConflictMap(sortedPlayers);
  const teamState = createTeamState(teamCodes);
  const assignments: TeamAssignment[] = [];

  sortedPlayers.forEach((player, index) => {
    const preferredTeam = snakeSequence[index];
    const candidateTeams = [preferredTeam, ...teamCodes.filter((team) => team !== preferredTeam)].sort(
      (left, right) => {
        const leftState = teamState.get(left)!;
        const rightState = teamState.get(right)!;
        if (leftState.playerIds.length !== rightState.playerIds.length) {
          return leftState.playerIds.length - rightState.playerIds.length;
        }
        return leftState.totalQuota - rightState.totalQuota;
      }
    );

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

  return optimizeAssignments(assignments, sortedPlayers, teamCodes, conflictMap);
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
