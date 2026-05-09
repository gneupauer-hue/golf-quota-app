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

const expectedFormats = new Map<number, number[][]>([
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

const starterPlayers: SetupPlayer[] = [...regularPlayers, ...otherPlayers].map((player, index) => ({
  playerId: `player-${index + 1}`,
  playerName: player.name,
  quota: player.quota,
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

for (const [playerCount, expectedCapacities] of expectedFormats) {
  test(`getTeamFormats returns supported Match formats for ${playerCount} players`, () => {
    const formats = getTeamFormats(playerCount);

    assert.deepEqual(
      formats.map((format) => format.capacities),
      expectedCapacities
    );
    assert.deepEqual(
      formats.map((format) => format.teamCount),
      expectedCapacities.map((capacities) => capacities.length)
    );
  });

  for (const capacities of expectedCapacities) {
    test(`buildBalancedTeams always matches ${capacities.join(",")} for ${playerCount} players across 50 runs`, () => {
      const teamCodes = teamOptions.slice(0, capacities.length) as TeamCode[];
      const capacityMap = capacitiesToMap(teamCodes, capacities);

      for (let run = 0; run < 50; run += 1) {
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
}

test("team format labels describe mixed odd-count formats clearly", () => {
  assert.equal(getTeamFormats(9)[0]?.label, "3 teams of 3");
  assert.equal(getTeamFormats(11)[0]?.label, "1 team of 3 + 2 teams of 4");
  assert.equal(getTeamFormats(13)[0]?.label, "3 teams of 3 + 1 team of 4");
});

test("unsupported Match counts do not invent team formats", () => {
  for (const playerCount of [5, 17, 18]) {
    assert.deepEqual(getTeamFormats(playerCount), []);
  }
});
