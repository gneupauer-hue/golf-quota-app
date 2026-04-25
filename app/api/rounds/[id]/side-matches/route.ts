import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parsePlayerIds(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function validateSideMatchPayload(body: Record<string, unknown>) {
  const teamAPlayerIds = parsePlayerIds(body.teamAPlayerIds);
  const teamBPlayerIds = parsePlayerIds(body.teamBPlayerIds);
  const allPlayerIds = [...teamAPlayerIds, ...teamBPlayerIds];

  if (teamAPlayerIds.length !== 2 || teamBPlayerIds.length !== 2) {
    return { error: "Choose exactly two players per side." };
  }

  if (new Set(allPlayerIds).size !== allPlayerIds.length) {
    return { error: "A player can only appear once in the same side match." };
  }

  return {
    name: String(body.name ?? "").trim() || null,
    teamAPlayerIds,
    teamBPlayerIds
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const parsed = validateSideMatchPayload(body);

    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const round = await (prisma as any).round.findUnique({
      where: { id },
      select: {
        id: true,
        completedAt: true,
        canceledAt: true,
        lockedAt: true,
        startedAt: true,
        entries: {
          select: {
            playerId: true
          }
        }
      }
    });

    if (!round) {
      return NextResponse.json({ error: "Round not found." }, { status: 404 });
    }

    if (round.completedAt || round.canceledAt || (!round.lockedAt && !round.startedAt)) {
      return NextResponse.json(
        { error: "Side matches can only be created for the current active round." },
        { status: 400 }
      );
    }

    const roundPlayerIds = new Set((round.entries as Array<{ playerId: string }>).map((entry) => entry.playerId));
    if ([...parsed.teamAPlayerIds, ...parsed.teamBPlayerIds].some((playerId) => !roundPlayerIds.has(playerId))) {
      return NextResponse.json(
        { error: "All selected players must belong to the current round." },
        { status: 400 }
      );
    }

    const match = await (prisma as any).roundSideMatch.create({
      data: {
        roundId: id,
        name: parsed.name,
        teamAPlayerIds: parsed.teamAPlayerIds,
        teamBPlayerIds: parsed.teamBPlayerIds
      }
    });

    return NextResponse.json({ ok: true, match });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create side match." },
      { status: 500 }
    );
  }
}
