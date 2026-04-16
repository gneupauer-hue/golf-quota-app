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
    const sourceRound = await prisma.round.findUnique({
      where: { id },
      include: {
        entries: {
          orderBy: [{ rank: "asc" }, { playerId: "asc" }]
        }
      }
    });

    if (!sourceRound) {
      return NextResponse.json({ error: "Round not found." }, { status: 404 });
    }

    const copyName = `${sourceRound.roundName} Copy`;
    const newRound = await prisma.round.create({
      data: {
        roundName: copyName,
        roundDate: new Date(),
        roundMode: sourceRound.roundMode,
        notes: sourceRound.notes
      }
    });

    await prisma.$transaction(async (tx) => {
      await createOrReplaceRoundEntries(tx, {
        roundId: newRound.id,
        roundName: copyName,
        roundDate: newRound.roundDate,
        roundMode: sourceRound.roundMode === "SKINS_ONLY" ? "SKINS_ONLY" : "MATCH_QUOTA",
        notes: sourceRound.notes,
        teamCount: sourceRound.teamCount,
        lockedAt: sourceRound.lockedAt,
        startedAt: sourceRound.startedAt,
        entries: sourceRound.entries.map((entry) => ({
          playerId: entry.playerId,
          team: (entry.team as TeamCode | null) ?? null,
          groupNumber: entry.groupNumber,
          teeTime: entry.teeTime,
          holes: holeFieldNames.map(() => null)
        }))
      });
    });

    return NextResponse.json({ roundId: newRound.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not duplicate round." },
      { status: 500 }
    );
  }
}
