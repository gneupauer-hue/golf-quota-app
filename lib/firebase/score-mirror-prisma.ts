import type {
  PrismaScoreMirrorEntryInput,
  PrismaScoreMirrorRoundInput
} from "@/lib/firebase/score-mirror";

export const SCORE_MIRROR_PRISMA_ENTRY_SELECT = {
  id: true,
  playerId: true,
  player: {
    select: {
      name: true
    }
  },
  hole1: true,
  hole2: true,
  hole3: true,
  hole4: true,
  hole5: true,
  hole6: true,
  hole7: true,
  hole8: true,
  hole9: true,
  hole10: true,
  hole11: true,
  hole12: true,
  hole13: true,
  hole14: true,
  hole15: true,
  hole16: true,
  hole17: true,
  hole18: true,
  quickFrontNine: true,
  quickBackNine: true,
  frontSubmittedAt: true,
  backSubmittedAt: true,
  birdieHolesCsv: true
} as const;

export const SCORE_MIRROR_PRISMA_ROUND_SELECT = {
  id: true,
  roundMode: true,
  scoringEntryMode: true,
  entries: {
    orderBy: [{ playerId: "asc" }],
    select: SCORE_MIRROR_PRISMA_ENTRY_SELECT
  }
} as const;

export async function selectActivePrismaRoundScores(client: {
  round: {
    findMany: (args: any) => Promise<any[]>;
    findUnique: (args: any) => Promise<any | null>;
  };
}): Promise<PrismaScoreMirrorRoundInput | null> {
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
    select: SCORE_MIRROR_PRISMA_ROUND_SELECT
  });

  if (!round) {
    return null;
  }

  return {
    id: round.id,
    roundMode: String(round.roundMode),
    scoringEntryMode: String(round.scoringEntryMode),
    entries: (round.entries as any[]).map(
      (entry): PrismaScoreMirrorEntryInput => ({
        id: entry.id,
        playerId: entry.playerId,
        playerName: entry.player?.name ?? null,
        hole1: entry.hole1 ?? null,
        hole2: entry.hole2 ?? null,
        hole3: entry.hole3 ?? null,
        hole4: entry.hole4 ?? null,
        hole5: entry.hole5 ?? null,
        hole6: entry.hole6 ?? null,
        hole7: entry.hole7 ?? null,
        hole8: entry.hole8 ?? null,
        hole9: entry.hole9 ?? null,
        hole10: entry.hole10 ?? null,
        hole11: entry.hole11 ?? null,
        hole12: entry.hole12 ?? null,
        hole13: entry.hole13 ?? null,
        hole14: entry.hole14 ?? null,
        hole15: entry.hole15 ?? null,
        hole16: entry.hole16 ?? null,
        hole17: entry.hole17 ?? null,
        hole18: entry.hole18 ?? null,
        quickFrontNine: entry.quickFrontNine ?? null,
        quickBackNine: entry.quickBackNine ?? null,
        frontSubmittedAt: entry.frontSubmittedAt ?? null,
        backSubmittedAt: entry.backSubmittedAt ?? null,
        birdieHolesCsv: entry.birdieHolesCsv ?? null
      })
    )
  };
}
