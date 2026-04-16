import type { PrismaClient } from "@prisma/client";
import { createOrReplaceRoundEntries } from "./round-service";

const scorePlan = [6, 4, 2, 1, 0, -1] as const;

export const regularPlayers = [
  ["Billy Mattioli", 27],
  ["Bob Lipski", 34],
  ["Brandon Wills", 33],
  ["Chad Kelly", 27],
  ["Gary Neupauer", 20],
  ["Jay Thomas", 32],
  ["Jeff Hodorowski", 27],
  ["John Thomas", 27],
  ["Lou Belgio", 30],
  ["Marty Behm", 32],
  ["Mike Mahasky", 26],
  ["Mike Wills", 35],
  ["Rob Michaels", 27],
  ["Ryan Holthaus", 17],
  ["Scott Francis", 31],
  ["Scott Schifter", 15]
] as const;

export const otherPlayers = [
  ["AJ Kochanski", 26],
  ["Bob Ashworth", 21],
  ["Bogey", 22],
  ["Brett Sikora", 23],
  ["Brett Slocum", 25],
  ["Broj", 33],
  ["Chad DeBona", 30],
  ["Charlie Gelso", 29],
  ["Chris Jones", 29],
  ["Chris Sikora", 15],
  ["Chuck Brand", 31],
  ["Cooper Kelly", 30],
  ["Dave Straley", 30],
  ["Dave Yurko", 31],
  ["Derek Shurmanek", 26],
  ["Ethan Zawatski", 41],
  ["Jack Fenwick", 33],
  ["Jack Morris", 29],
  ["Jake Humphreys", 27],
  ["Jim Blinn", 34],
  ["Jim Fronzoni", 26],
  ["Joe Bevavino", 34],
  ["Joe Collini", 32],
  ["Joe Rubbico", 28],
  ["John Ashley", 32],
  ["Jonathon Wilson", 41],
  ["Matt Alfano", 19],
  ["Mike Aritz", 22],
  ["Mike Boland", 32],
  ["Mike Lipski", 23],
  ["Pat Murray", 26],
  ["Phil Lipski", 22],
  ["Ron Prokrinchak", 21],
  ["Tony Bevevino", 38],
  ["Travis Debona", 27]
] as const;

type StarterPlayerSeed = {
  name: string;
  quota: number;
  isRegular: boolean;
};

const starterPlayers: StarterPlayerSeed[] = [
  ...regularPlayers.map(([name, quota]) => ({ name, quota, isRegular: true })),
  ...otherPlayers.map(([name, quota]) => ({ name, quota, isRegular: false }))
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
        startingQuota: playerSeed.quota,
        isRegular: playerSeed.isRegular,
        isActive: true
      },
      create: {
        name: playerSeed.name,
        startingQuota: playerSeed.quota,
        currentQuota: playerSeed.quota,
        isRegular: playerSeed.isRegular,
        isActive: true
      }
    });

    createdPlayers.set(playerSeed.name, player.id);
  }

  return createdPlayers;
}
