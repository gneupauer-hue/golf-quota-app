import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { holeFieldNames, type TeamCode } from "@/lib/quota";
import { createOrReplaceRoundEntries } from "@/lib/round-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const round = await prisma.round.findUnique({
      where: { id },
      include: {
        entries: {
          orderBy: [{ rank: "asc" }, { playerId: "asc" }]
        }
      }
    });

    if (!round) {
      return NextResponse.json({ error: "Round not found." }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await createOrReplaceRoundEntries(tx, {
        roundId: round.id,
        roundName: round.roundName,
        roundDate: round.roundDate,
        roundMode: round.roundMode === "SKINS_ONLY" ? "SKINS_ONLY" : "MATCH_QUOTA",
        notes: round.notes,
        teamCount: round.teamCount,
        lockedAt: round.lockedAt,
        startedAt: round.startedAt,
        entries: round.entries.map((entry) => ({
          playerId: entry.playerId,
          team: (entry.team as TeamCode | null) ?? null,
          groupNumber: entry.groupNumber,
          teeTime: entry.teeTime,
          holes: holeFieldNames.map(() => null)
        }))
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not reset round template." },
      { status: 500 }
    );
  }
}
