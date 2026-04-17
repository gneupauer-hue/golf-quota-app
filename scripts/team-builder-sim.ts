import {
  buildBalancedTeams,
  capacitiesToMap,
  getTeamFormats
} from "@/lib/round-setup";
import { regularPlayers, otherPlayers } from "@/lib/seed-data";
import { teamOptions, type TeamCode } from "@/lib/quota";

type SetupPlayer = {
  playerId: string;
  playerName: string;
  quota: number;
  conflictIds: string[];
};

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

function summarizeSpread(players: SetupPlayer[], assignments: ReturnType<typeof buildBalancedTeams>, teamCodes: TeamCode[]) {
  const quotasByPlayer = new Map(players.map((player) => [player.playerId, player.quota]));
  const totals = teamCodes.map((team) =>
    assignments
      .filter((assignment) => assignment.team === team)
      .reduce((sum, assignment) => sum + (quotasByPlayer.get(assignment.playerId) ?? 0), 0)
  );

  return {
    totals,
    spread: Math.max(...totals) - Math.min(...totals)
  };
}

for (let playerCount = 6; playerCount <= 16; playerCount += 1) {
  const format = getTeamFormats(playerCount)[0];
  if (!format) {
    console.log(`${playerCount}: unsupported`);
    continue;
  }

  const teamCodes = teamOptions.slice(0, format.teamCount) as TeamCode[];
  const capacities = capacitiesToMap(teamCodes, format.capacities);
  let minSpread = Number.POSITIVE_INFINITY;
  let maxSpread = Number.NEGATIVE_INFINITY;

  for (let run = 0; run < 100; run += 1) {
    const players = pickPlayers(playerCount, playerCount * 1000 + run);
    const assignments = buildBalancedTeams(players, teamCodes, capacities);
    const summary = summarizeSpread(players, assignments, teamCodes);
    minSpread = Math.min(minSpread, summary.spread);
    maxSpread = Math.max(maxSpread, summary.spread);
  }

  console.log(
    `${playerCount}: format ${format.capacities.join(",")} | runs 100 | spread min ${minSpread} max ${maxSpread}`
  );
}
