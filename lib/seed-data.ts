import type { PrismaClient } from "@prisma/client";
import { createOrReplaceRoundEntries } from "./round-service";

const scorePlan = [6, 4, 2, 1, 0, -1] as const;

export const regularPlayers = [
  { name: "Avery Cole", quota: 27 },
  { name: "Blake Morgan", quota: 34 },
  { name: "Cameron Reed", quota: 33 },
  { name: "Dakota Lane", quota: 23 },
  { name: "Emerson Shaw", quota: 17 },
  { name: "Finley Brooks", quota: 32 },
  { name: "Gray Parker", quota: 28 },
  { name: "Harper Quinn", quota: 27 },
  { name: "Indigo Flynn", quota: 30 },
  { name: "Jordan Ellis", quota: 34 },
  { name: "Kai Turner", quota: 25 },
  { name: "Logan Hayes", quota: 34 },
  { name: "Morgan Price", quota: 23 },
  { name: "Nico Avery", quota: 15 },
  { name: "Oakley Stone", quota: 30 },
  { name: "Parker West", quota: 15 }
] as const;

export const otherPlayers = [
  { name: "Quinn Adler", quota: 26 },
  { name: "River Boone", quota: 21 },
  { name: "Sage Carter", quota: 22 },
  { name: "Taylor Dean", quota: 23 },
  { name: "Uma Foster", quota: 25 },
  { name: "Valen Grant", quota: 33 },
  { name: "Winter Hale", quota: 30 },
  { name: "Xen Harper", quota: 29 },
  { name: "Yael Irwin", quota: 29 },
  { name: "Zion Keller", quota: 15 },
  { name: "Arden Lewis", quota: 31 },
  { name: "Briar Monroe", quota: 30 },
  { name: "Cedar Nolan", quota: 30 },
  { name: "Drew Oak", quota: 31 },
  { name: "Elliot Page", quota: 26 },
  { name: "Frankie Reese", quota: 41 },
  { name: "Gale Sutton", quota: 32 },
  { name: "Hollis Tate", quota: 29 },
  { name: "Jules Upton", quota: 27 },
  { name: "Kendall Vale", quota: 34 },
  { name: "Lennon Ward", quota: 26 },
  { name: "Marin York", quota: 22 },
  { name: "Noel Zane", quota: 21 },
  { name: "Orion Ames", quota: 38 },
  { name: "Presley Birch", quota: 27 }
] as const;

type StarterPlayerSeed = {
  name: string;
  quota: number;
  isRegular: boolean;
  previousNames?: readonly string[];
};

const starterPlayers: StarterPlayerSeed[] = [
  ...regularPlayers.map((player) => ({ ...player, isRegular: true })),
  ...otherPlayers.map((player) => ({ ...player, isRegular: false }))
];

function buildHolesForTotal(total: number) {
  const holes = Array.from({ length: 18 }, () => 0);
  let remaining = total;
  let index = 0;

  while (remaining > 0 && index < holes.length) {
    const value =
      scorePlan.find((candidate) => candidate > 0 && candidate <= remaining) ?? 1;
    holes[index] = value;
    remaining -= value;
    index += 1;
  }

  if (remaining < 0) {
    holes[Math.max(0, index - 1)] += remaining;
  }

  return holes;
}

export async function resetDemoData(prisma: PrismaClient) {
  await prisma.playerConflict.deleteMany();
  await prisma.roundTeamResult.deleteMany();
  await prisma.roundSkinHole.deleteMany();
  await prisma.roundPayoutSummary.deleteMany();
  await prisma.roundEntry.deleteMany();
  await prisma.round.deleteMany();
  await prisma.player.deleteMany();

  const createdPlayers = await ensureStarterPlayers(prisma);

  const round410 = await prisma.round.create({
    data: {
      roundName: "4.10",
      roundDate: new Date("2026-04-10"),
      scoringEntryMode: "DETAILED",
      notes: "Fast sample round for mobile entry testing."
    }
  });

  const round410Entries: Array<[string, number, "A" | "B" | "C" | "D"]> = [
    ["Avery Cole", 23, "A"],
    ["Nico Avery", 21, "A"],
    ["Parker West", 18, "B"],
    ["Blake Morgan", 29, "B"],
    ["Finley Brooks", 32, "C"],
    ["Logan Hayes", 36, "C"],
    ["Morgan Price", 31, "D"],
    ["Quinn Adler", 27, "D"]
  ];

  await createOrReplaceRoundEntries(prisma, {
    roundId: round410.id,
    roundName: "4.10",
    roundDate: new Date("2026-04-10"),
    roundMode: "MATCH_QUOTA",
    scoringEntryMode: "DETAILED",
    notes: "Fast sample round for mobile entry testing.",
    entries: round410Entries.map(([name, totalPoints, team]) => ({
      playerId: createdPlayers.get(name)!,
      team,
      holes: buildHolesForTotal(totalPoints)
    }))
  });

  const round411 = await prisma.round.create({
    data: {
      roundName: "4.11",
      roundDate: new Date("2026-04-11"),
      scoringEntryMode: "DETAILED",
      notes: "Sample weekend round."
    }
  });

  const round411Entries: Array<[string, number, "A" | "B" | "C" | "D"]> = [
    ["Avery Cole", 24, "A"],
    ["Nico Avery", 16, "A"],
    ["Oakley Stone", 35, "B"],
    ["Dakota Lane", 30, "B"],
    ["Gray Parker", 28, "C"],
    ["Kai Turner", 24, "C"],
    ["Orion Ames", 39, "D"],
    ["Lennon Ward", 29, "D"]
  ];

  await createOrReplaceRoundEntries(prisma, {
    roundId: round411.id,
    roundName: "4.11",
    roundDate: new Date("2026-04-11"),
    roundMode: "MATCH_QUOTA",
    scoringEntryMode: "DETAILED",
    notes: "Sample weekend round.",
    entries: round411Entries.map(([name, totalPoints, team]) => ({
      playerId: createdPlayers.get(name)!,
      team,
      holes: buildHolesForTotal(totalPoints)
    }))
  });
}

export async function ensureStarterPlayers(prisma: PrismaClient) {
  const createdPlayers = new Map<string, string>();

  for (const playerSeed of starterPlayers) {
    const existingPlayer = await prisma.player.findFirst({
      where: {
        OR: [{ name: playerSeed.name }, ...(playerSeed.previousNames ?? []).map((name) => ({ name }))]
      }
    });

    const player = existingPlayer
      ? await prisma.player.update({
          where: { id: existingPlayer.id },
          data: {
            name: playerSeed.name,
            isRegular: playerSeed.isRegular,
            isActive: true
          }
        })
      : await prisma.player.create({
          data: {
            name: playerSeed.name,
            quota: playerSeed.quota,
            currentQuota: playerSeed.quota,
            startingQuota: playerSeed.quota,
            isRegular: playerSeed.isRegular,
            isActive: true
          }
        });

    createdPlayers.set(playerSeed.name, player.id);
    for (const previousName of playerSeed.previousNames ?? []) {
      createdPlayers.set(previousName, player.id);
    }
  }

  return createdPlayers;
}