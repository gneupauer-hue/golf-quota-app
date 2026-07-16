import type {
  PrismaRoundMirrorEntryInput,
  PrismaRoundMirrorInput
} from "@/lib/firebase/round-mirror";

export const ROUND_MIRROR_PRISMA_ENTRY_SELECT = {
  id: true,
  playerId: true,
  team: true,
  groupNumber: true,
  teeTime: true,
  startQuota: true,
  player: {
    select: {
      id: true,
      name: true,
      quota: true,
      currentQuota: true,
      startingQuota: true,
      isActive: true,
      isRegular: true
    }
  }
} as const;

export const ROUND_MIRROR_PRISMA_ROUND_SELECT = {
  id: true,
  roundName: true,
  roundDate: true,
  roundMode: true,
  scoringEntryMode: true,
  isTestRound: true,
  teamCount: true,
  notes: true,
  createdAt: true,
  canceledAt: true,
  completedAt: true,
  lockedAt: true,
  startedAt: true,
  entries: {
    orderBy: [{ groupNumber: "asc" }, { teeTime: "asc" }, { team: "asc" }, { playerId: "asc" }],
    select: ROUND_MIRROR_PRISMA_ENTRY_SELECT
  }
} as const;

export async function selectActivePrismaRoundSetup(client: {
  round: {
    findMany: (args: any) => Promise<any[]>;
    findUnique: (args: any) => Promise<any | null>;
  };
}): Promise<PrismaRoundMirrorInput | null> {
  const incompleteRounds = await client.round.findMany({
    where: {
      completedAt: null,
      canceledAt: null
    },
    orderBy: {
      createdAt: "desc"
    },
    select: {
      id: true,
      lockedAt: true,
      startedAt: true,
      _count: {
        select: {
          entries: true
        }
      }
    }
  });

  if (!incompleteRounds.length) {
    return null;
  }

  const engagedRounds = incompleteRounds.filter(
    (round) => round.startedAt || round.lockedAt || round._count.entries > 0
  );
  const activeRoundId = (engagedRounds[0] ?? incompleteRounds[0]).id;
  const round = await client.round.findUnique({
    where: { id: activeRoundId },
    select: ROUND_MIRROR_PRISMA_ROUND_SELECT
  });

  if (!round) {
    return null;
  }

  return {
    ...round,
    roundMode: String(round.roundMode),
    scoringEntryMode: String(round.scoringEntryMode),
    teamCount: round.teamCount ?? null,
    notes: round.notes ?? null,
    updatedAt: round.createdAt,
    canceledAt: round.canceledAt ?? null,
    completedAt: round.completedAt ?? null,
    lockedAt: round.lockedAt ?? null,
    startedAt: round.startedAt ?? null,
    entries: (round.entries as any[]).map(
      (entry): PrismaRoundMirrorEntryInput => ({
        id: entry.id,
        playerId: entry.playerId,
        player: entry.player,
        startQuota: entry.startQuota,
        team: entry.team,
        groupNumber: entry.groupNumber,
        teeTime: entry.teeTime
      })
    )
  };
}
