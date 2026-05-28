import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBalancedTeams,
  buildPartnerHistoryFromRoundEntries,
  capacitiesToMap,
  getPartnerPairKey,
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

function getTeamPairKeys(assignments: ReturnType<typeof buildBalancedTeams>) {
  const byTeam = new Map<TeamCode, string[]>();

  for (const assignment of assignments) {
    const playerIds = byTeam.get(assignment.team) ?? [];
    playerIds.push(assignment.playerId);
    byTeam.set(assignment.team, playerIds);
  }

  return Array.from(byTeam.values())
    .flatMap((playerIds) => {
      const pairs: string[] = [];
      for (let leftIndex = 0; leftIndex < playerIds.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < playerIds.length; rightIndex += 1) {
          pairs.push(getPartnerPairKey(playerIds[leftIndex], playerIds[rightIndex]));
        }
      }
      return pairs;
    })
    .sort();
}

function oldTeamPartnerCounts(teamPlayerIds: string[][], repeatCount = 4) {
  const counts: Record<string, number> = {};

  for (const playerIds of teamPlayerIds) {
    for (let leftIndex = 0; leftIndex < playerIds.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < playerIds.length; rightIndex += 1) {
        counts[getPartnerPairKey(playerIds[leftIndex], playerIds[rightIndex])] = repeatCount;
      }
    }
  }

  return counts;
}

function makeNumberedPlayers(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    playerId: `p${index + 1}`,
    playerName: `Player ${index + 1}`,
    quota: 40 - index,
    conflictIds: []
  }));
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

test("partner history counts stable player ID teammate pairs from completed round entries", () => {
  const history = buildPartnerHistoryFromRoundEntries([
    {
      entries: [
        { playerId: "gary-id", team: "A" },
        { playerId: "rob-id", team: "A" },
        { playerId: "john-id", team: "B" }
      ]
    },
    {
      entries: [
        { playerId: "rob-id", team: "A" },
        { playerId: "gary-id", team: "A" },
        { playerId: "john-id", team: "A" },
        { playerId: "skip-no-team", team: null }
      ]
    }
  ]);

  assert.equal(history[getPartnerPairKey("gary-id", "rob-id")], 2);
  assert.equal(history[getPartnerPairKey("gary-id", "john-id")], 1);
  assert.equal(history[getPartnerPairKey("rob-id", "john-id")], 1);
  assert.equal(history[getPartnerPairKey("gary-id", "skip-no-team")] ?? 0, 0);
});

test("2-man team builder avoids repeat partners when alternatives exist", () => {
  const players = makeNumberedPlayers(8);
  const teamCodes = teamOptions.slice(0, 4) as TeamCode[];
  const capacityMap = capacitiesToMap(teamCodes, [2, 2, 2, 2]);
  const repeatedPairs = [
    getPartnerPairKey("p1", "p2"),
    getPartnerPairKey("p3", "p4"),
    getPartnerPairKey("p5", "p6"),
    getPartnerPairKey("p7", "p8")
  ];
  const partnerCounts = Object.fromEntries(repeatedPairs.map((key) => [key, 4]));

  const assignments = buildBalancedTeams(players, teamCodes, capacityMap, {
    partnerCounts,
    variant: 3
  });
  const pairKeys = getTeamPairKeys(assignments);

  assert.equal(validateTeamAssignments(assignments, teamCodes, capacityMap).valid, true);
  assert.equal(pairKeys.some((key) => repeatedPairs.includes(key)), false);
});

test("2-man team rebuild variants can produce different valid pairings", () => {
  const players = makeNumberedPlayers(8);
  const teamCodes = teamOptions.slice(0, 4) as TeamCode[];
  const capacityMap = capacitiesToMap(teamCodes, [2, 2, 2, 2]);
  const signatures = new Set<string>();

  for (let variant = 0; variant < 8; variant += 1) {
    const assignments = buildBalancedTeams(players, teamCodes, capacityMap, { variant });
    assert.equal(validateTeamAssignments(assignments, teamCodes, capacityMap).valid, true);
    signatures.add(getTeamPairKeys(assignments).join("/"));
  }

  assert.ok(signatures.size > 1);
});

test("3-man team builder avoids repeated teammate pairs when alternatives exist", () => {
  const players = makeNumberedPlayers(9);
  const teamCodes = teamOptions.slice(0, 3) as TeamCode[];
  const capacityMap = capacitiesToMap(teamCodes, [3, 3, 3]);
  const partnerCounts = oldTeamPartnerCounts([
    ["p1", "p2", "p3"],
    ["p4", "p5", "p6"],
    ["p7", "p8", "p9"]
  ]);
  const repeatedPairs = Object.keys(partnerCounts);
  const assignments = buildBalancedTeams(players, teamCodes, capacityMap, {
    partnerCounts,
    variant: 5
  });
  const pairKeys = getTeamPairKeys(assignments);

  assert.equal(validateTeamAssignments(assignments, teamCodes, capacityMap).valid, true);
  assert.equal(pairKeys.some((key) => repeatedPairs.includes(key)), false);
});

test("4-man team builder avoids repeated teammate pairs when alternatives exist", () => {
  const players = makeNumberedPlayers(16);
  const teamCodes = teamOptions.slice(0, 4) as TeamCode[];
  const capacityMap = capacitiesToMap(teamCodes, [4, 4, 4, 4]);
  const partnerCounts = oldTeamPartnerCounts([
    ["p1", "p2", "p3", "p4"],
    ["p5", "p6", "p7", "p8"],
    ["p9", "p10", "p11", "p12"],
    ["p13", "p14", "p15", "p16"]
  ]);
  const repeatedPairs = Object.keys(partnerCounts);
  const assignments = buildBalancedTeams(players, teamCodes, capacityMap, {
    partnerCounts,
    variant: 11
  });
  const pairKeys = getTeamPairKeys(assignments);

  assert.equal(validateTeamAssignments(assignments, teamCodes, capacityMap).valid, true);
  assert.equal(pairKeys.some((key) => repeatedPairs.includes(key)), false);
});

test("3- and 4-man rebuild variants can produce different valid team sets", () => {
  for (const { playerCount, capacities } of [
    { playerCount: 12, capacities: [3, 3, 3, 3] },
    { playerCount: 16, capacities: [4, 4, 4, 4] }
  ]) {
    const players = makeNumberedPlayers(playerCount);
    const teamCodes = teamOptions.slice(0, capacities.length) as TeamCode[];
    const capacityMap = capacitiesToMap(teamCodes, capacities);
    const signatures = new Set<string>();

    for (let variant = 0; variant < 8; variant += 1) {
      const assignments = buildBalancedTeams(players, teamCodes, capacityMap, { variant });
      assert.equal(validateTeamAssignments(assignments, teamCodes, capacityMap).valid, true);
      signatures.add(getTeamPairKeys(assignments).join("/"));
    }

    assert.ok(signatures.size > 1, `expected more than one team set for ${playerCount} players`);
  }
});
