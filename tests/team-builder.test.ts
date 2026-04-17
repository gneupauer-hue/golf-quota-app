import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBalancedTeams,
  capacitiesToMap,
  getTeamFormats,
  validateTeamAssignments
} from "@/lib/round-setup";
import { regularPlayers, otherPlayers } from "@/lib/seed-data";
import { teamOptions, type TeamCode } from "@/lib/quota";

type SetupPlayer = {
  playerId: string;
  playerName: string;
  quota: number;
  conflictIds: string[];
};

const expectedCapacities = new Map<number, number[]>([
  [4, [2, 2]],
  [6, [3, 3]],
  [7, [3, 4]],
  [8, [4, 4]],
  [9, [3, 3, 3]],
  [10, [3, 3, 4]],
  [11, [3, 4, 4]],
  [12, [4, 4, 4]],
  [13, [3, 3, 3, 4]],
  [14, [3, 3, 4, 4]],
  [15, [3, 4, 4, 4]],
  [16, [4, 4, 4, 4]]
]);

const starterPlayers: SetupPlayer[] = [...regularPlayers, ...otherPlayers].map((player, index) => ({
  playerId: `player-${index + 1}`,
  playerName: player.name,
  quota: player.currentQuota,
  conflictIds: []
}));

function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pickPlayers(count: number, seed: number) {
  const rng = createSeededRandom(seed);
  const pool = [...starterPlayers];

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }

  return pool.slice(0, count);
}

function getAssignmentSizes(assignments: ReturnType<typeof buildBalancedTeams>, teamCodes: TeamCode[]) {
  return teamCodes.map((team) => assignments.filter((assignment) => assignment.team === team).length);
}

for (const [playerCount, capacities] of expectedCapacities) {
  test(`getTeamFormats returns the fixed Match format for ${playerCount} players`, () => {
    const formats = getTeamFormats(playerCount);

    assert.equal(formats.length, 1);
    assert.deepEqual(formats[0]?.capacities, capacities);
    assert.equal(formats[0]?.teamCount, capacities.length);
  });

  test(`buildBalancedTeams always matches ${capacities.join(",")} for ${playerCount} players across 100 runs`, () => {
    const teamCodes = teamOptions.slice(0, capacities.length) as TeamCode[];
    const capacityMap = capacitiesToMap(teamCodes, capacities);

    for (let run = 0; run < 100; run += 1) {
      const players = pickPlayers(playerCount, playerCount * 1000 + run);
      const assignments = buildBalancedTeams(players, teamCodes, capacityMap);
      const validation = validateTeamAssignments(assignments, teamCodes, capacityMap);

      assert.equal(
        assignments.length,
        playerCount,
        `expected ${playerCount} assignments for ${playerCount} players on run ${run + 1}`
      );
      assert.equal(
        validation.valid,
        true,
        `validation failed for ${playerCount} players on run ${run + 1}: got ${getAssignmentSizes(assignments, teamCodes).join(",")}`
      );
      assert.deepEqual(
        getAssignmentSizes(assignments, teamCodes),
        capacities,
        `capacity mismatch for ${playerCount} players on run ${run + 1}`
      );
    }
  });
}

test("unsupported Match counts do not invent team formats", () => {
  for (const playerCount of [5, 17, 18]) {
    assert.deepEqual(getTeamFormats(playerCount), []);
  }
});
