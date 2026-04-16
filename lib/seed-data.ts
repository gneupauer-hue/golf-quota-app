import type { PrismaClient } from "@prisma/client";
import { createOrReplaceRoundEntries } from "./round-service";

const scorePlan = [6, 4, 2, 1, 0, -1] as const;

export const regularPlayers = [
  { name: "Billy Mattioli", startingQuota: 27, currentQuota: 27 },
  { name: "Bob Lipski", startingQuota: 34, currentQuota: 34 },
  { name: "Brandon Wills", startingQuota: 33, currentQuota: 33 },
  { name: "Chad Kelly", startingQuota: 27, currentQuota: 23 },
  { name: "Gary Neupauer", startingQuota: 20, currentQuota: 17 },
  { name: "Jay Thomas", startingQuota: 32, currentQuota: 32 },
  { name: "Jeff Hodorowski", startingQuota: 27, currentQuota: 28 },
  { name: "John Thomas", startingQuota: 27, currentQuota: 27 },
  { name: "Lou Belgio", startingQuota: 30, currentQuota: 30 },
  { name: "Marty Behm", startingQuota: 32, currentQuota: 34 },
  { name: "Mike Mahasky", startingQuota: 26, currentQuota: 25 },
  { name: "Mike Wills", startingQuota: 35, currentQuota: 34 },
  { name: "Rob Michaels", startingQuota: 27, currentQuota: 23 },
  { name: "Ryan Holthaus", startingQuota: 17, currentQuota: 15 },
  { name: "Scott Francis", startingQuota: 31, currentQuota: 30 },
  { name: "Scott Schifter", startingQuota: 15, currentQuota: 15 }
] as const;

export const otherPlayers = [
  { name: "AJ Kochanski", startingQuota: 26, currentQuota: 26 },
  { name: "Bob Ashworth", startingQuota: 21, currentQuota: 21 },
  { name: "Bogey", startingQuota: 22, currentQuota: 22 },
  { name: "Brett Sikora", startingQuota: 23, currentQuota: 23 },
  { name: "Brett Slocum", startingQuota: 25, currentQuota: 25 },
  { name: "Broj", startingQuota: 33, currentQuota: 33 },
  { name: "Chad DeBona", startingQuota: 30, currentQuota: 30 },
  { name: "Charlie Gelso", startingQuota: 29, currentQuota: 29 },
  { name: "Chris Jones", startingQuota: 29, currentQuota: 29 },
  { name: "Chris Sikora", startingQuota: 15, currentQuota: 15 },
  { name: "Chuck Brand", startingQuota: 31, currentQuota: 31 },
  { name: "Cooper Kelly", startingQuota: 30, currentQuota: 30 },
  { name: "Dave Straley", startingQuota: 30, currentQuota: 30 },
  { name: "Dave Yurko", startingQuota: 31, currentQuota: 31 },
  { name: "Derek Shurmanek", startingQuota: 26, currentQuota: 26 },
  { name: "Ethan Zawatski", startingQuota: 41, currentQuota: 41 },
  { name: "Jack Fenwick", startingQuota: 33, currentQuota: 32 },
  { name: "Jack Morris", startingQuota: 29, currentQuota: 29 },
  { name: "Jake Humphreys", startingQuota: 27, currentQuota: 27 },
  { name: "Jim Blinn", startingQuota: 34, currentQuota: 34 },
  { name: "Jim Fronzoni", startingQuota: 26, currentQuota: 26 },
  { name: "Joe Bevavino", startingQuota: 34, currentQuota: 34 },
  { name: "Joe Collini", startingQuota: 32, currentQuota: 32 },
  { name: "Joe Rubbico", startingQuota: 28, currentQuota: 27 },
  { name: "John Ashley", startingQuota: 32, currentQuota: 32 },
  { name: "Jonathon Wilson", startingQuota: 41, currentQuota: 41 },
  { name: "Matt Alfano", startingQuota: 19, currentQuota: 19 },
  { name: "Mike Aritz", startingQuota: 22, currentQuota: 22 },
  { name: "Mike Boland", startingQuota: 32, currentQuota: 32 },
  { name: "Mike Lipski", startingQuota: 23, currentQuota: 23 },
  { name: "Pat Murray", startingQuota: 26, currentQuota: 26 },
  { name: "Phil Lipski", startingQuota: 22, currentQuota: 22 },
  { name: "Ron Prokrinchak", startingQuota: 21, currentQuota: 21 },
  { name: "Tony Bevevino", startingQuota: 38, currentQuota: 38 },
  { name: "Travis Debona", startingQuota: 27, currentQuota: 27 }
] as const;

type StarterPlayerSeed = {
  name: string;
  startingQuota: number;
  currentQuota: number;
  isRegular: boolean;
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
      notes: "Fast sample round for mobile entry testing."
    }
  });

  const round410Entries: Array<[string, number, "A" | "B" | "C" | "D"]> = [
    ["Gary Neupauer", 23, "A"],
    ["Ryan Holthaus", 21, "A"],
    ["Scott Schifter", 18, "B"],
    ["Billy Mattioli", 29, "B"],
    ["Bob Lipski", 32, "C"],
    ["Mike Wills", 36, "C"],
    ["Rob Michaels", 31, "D"],
    ["AJ Kochanski", 27, "D"]
  ];

  await createOrReplaceRoundEntries(prisma, {
    roundId: round410.id,
    roundName: "4.10",
    roundDate: new Date("2026-04-10"),
    roundMode: "MATCH_QUOTA",
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
      notes: "Sample weekend round."
    }
  });

  const round411Entries: Array<[string, number, "A" | "B" | "C" | "D"]> = [
    ["Gary Neupauer", 24, "A"],
    ["Ryan Holthaus", 16, "A"],
    ["Scott Francis", 35, "B"],
    ["Chad Kelly", 30, "B"],
    ["Jeff Hodorowski", 28, "C"],
    ["Mike Mahasky", 24, "C"],
    ["Tony Bevevino", 39, "D"],
    ["Pat Murray", 29, "D"]
  ];

  await createOrReplaceRoundEntries(prisma, {
    roundId: round411.id,
    roundName: "4.11",
    roundDate: new Date("2026-04-11"),
    roundMode: "MATCH_QUOTA",
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
    const player = await prisma.player.upsert({
      where: {
        name: playerSeed.name
      },
      update: {
        startingQuota: playerSeed.startingQuota,
        currentQuota: playerSeed.currentQuota,
        isRegular: playerSeed.isRegular,
        isActive: true
      },
      create: {
        name: playerSeed.name,
        startingQuota: playerSeed.startingQuota,
        currentQuota: playerSeed.currentQuota,
        isRegular: playerSeed.isRegular,
        isActive: true
      }
    });

    createdPlayers.set(playerSeed.name, player.id);
  }

  return createdPlayers;
}
