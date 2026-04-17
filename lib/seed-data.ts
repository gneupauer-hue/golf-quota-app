import type { PrismaClient } from "@prisma/client";
import { createOrReplaceRoundEntries } from "./round-service";

const scorePlan = [6, 4, 2, 1, 0, -1] as const;

export const regularPlayers = [
  { name: "Billy Mattioli", quota: 27 },
  { name: "Bob Lipski", quota: 34 },
  { name: "Brandon Wills", quota: 33 },
  { name: "Chad Kelly", quota: 23 },
  { name: "Gary Neupauer", quota: 17 },
  { name: "Jay Thomas", quota: 32 },
  { name: "Jeff Hodorowski", quota: 28 },
  { name: "John Thomas", quota: 27 },
  { name: "Lou Belgio", quota: 30 },
  { name: "Marty Behm", quota: 34 },
  { name: "Mike Mahasky", quota: 25 },
  { name: "Mike Wills", quota: 34 },
  { name: "Rob Michaels", quota: 23 },
  { name: "Ryan Holthaus", quota: 15 },
  { name: "Scott Francis", quota: 30 },
  { name: "Scott Schifter", quota: 15 }
] as const;

export const otherPlayers = [
  { name: "AJ Kochanski", quota: 26 },
  { name: "Bob Ashworth", quota: 21 },
  { name: "Bogey", quota: 22 },
  { name: "Brett Sikora", quota: 23 },
  { name: "Brett Slocum", quota: 25 },
  { name: "Broj", quota: 33 },
  { name: "Chad DeBona", quota: 30 },
  { name: "Charlie Gelso", quota: 29 },
  { name: "Chris Jones", quota: 29 },
  { name: "Chris Sikora", quota: 15 },
  { name: "Chuck Brand", quota: 31 },
  { name: "Cooper Kelly", quota: 30 },
  { name: "Dave Straley", quota: 30 },
  { name: "Dave Yurko", quota: 31 },
  { name: "Derek Shurmanek", quota: 26 },
  { name: "Ethan Zawatski", quota: 41 },
  { name: "Jack Fenwick", quota: 32 },
  { name: "Jack Morris", quota: 29 },
  { name: "Jake Humphreys", quota: 27 },
  { name: "Jim Blinn", quota: 34 },
  { name: "Jim Fronzoni", quota: 26 },
  { name: "Joe Bevavino", quota: 34 },
  { name: "Joe Collini", quota: 32 },
  { name: "Joe Rubbico", quota: 27 },
  { name: "John Ashley", quota: 32 },
  { name: "Jonathon Wilson", quota: 41 },
  { name: "Matt Alfano", quota: 19 },
  { name: "Mike Aritz", quota: 22 },
  { name: "Mike Boland", quota: 32 },
  { name: "Mike Lipski", quota: 23 },
  { name: "Pat Murray", quota: 26 },
  { name: "Phil Lipski", quota: 22 },
  { name: "Ron Prokrinchak", quota: 21 },
  { name: "Tony Bevevino", quota: 38 },
  { name: "Travis Debona", quota: 27 }
] as const;

type StarterPlayerSeed = {
  name: string;
  quota: number;
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
        quota: playerSeed.quota,
        isRegular: playerSeed.isRegular,
        isActive: true
      },
      create: {
        name: playerSeed.name,
        quota: playerSeed.quota,
        isRegular: playerSeed.isRegular,
        isActive: true
      }
    });

    createdPlayers.set(playerSeed.name, player.id);
  }

  return createdPlayers;
}
