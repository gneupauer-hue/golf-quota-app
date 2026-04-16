import { prisma } from "@/lib/prisma";

type RoundClient = typeof prisma;

export async function resolveActiveRound(client: RoundClient = prisma) {
  const incompleteRounds = await client.round.findMany({
    where: {
      completedAt: null
    },
    orderBy: {
      createdAt: "desc"
    },
    select: {
      id: true,
      roundName: true,
      createdAt: true,
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
  const canonicalRound = engagedRounds[0] ?? incompleteRounds[0];

  const staleDraftIds = incompleteRounds
    .filter(
      (round) =>
        round.id !== canonicalRound.id &&
        !round.startedAt &&
        !round.lockedAt &&
        round._count.entries === 0
    )
    .map((round) => round.id);

  if (staleDraftIds.length) {
    await client.round.updateMany({
      where: {
        id: {
          in: staleDraftIds
        }
      },
      data: {
        completedAt: new Date()
      }
    });
  }

  return {
    id: canonicalRound.id,
    roundName: canonicalRound.roundName
  };
}
