import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { holeScoreValues, teamOptions } from "@/lib/quota";
import { createOrReplaceRoundEntries } from "@/lib/round-service";
import { formatRoundNameFromDate } from "@/lib/utils";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const roundDate = String(body.roundDate ?? "").trim();
    const roundName = String(body.roundName ?? "").trim();
    const notes = String(body.notes ?? "");
    const teamCount =
      body.teamCount == null || body.teamCount === "" ? null : Number(body.teamCount);
    const lockedAt =
      body.lockedAt == null || body.lockedAt === "" ? null : new Date(String(body.lockedAt));
    const startedAt =
      body.startedAt == null || body.startedAt === "" ? null : new Date(String(body.startedAt));
    const forceComplete = Boolean(body.forceComplete);
    const entries = Array.isArray(body.entries)
      ? (body.entries as Array<Record<string, unknown>>)
      : [];

    if (!roundDate) {
      return NextResponse.json({ error: "Round date is required." }, { status: 400 });
    }

    const resolvedRoundName = roundName || formatRoundNameFromDate(roundDate);

    if (teamCount !== null && (Number.isNaN(teamCount) || teamCount < 2 || teamCount > 5)) {
      return NextResponse.json({ error: "Team count must be between 2 and 5." }, { status: 400 });
    }

    const seen = new Set<string>();

    for (const entry of entries) {
      const playerId = String(entry.playerId ?? "").trim();
      const team = entry.team == null || entry.team === "" ? null : String(entry.team);
      const holes = Array.isArray(entry.holes)
        ? (entry.holes as unknown[]).map((value: unknown) =>
            value == null || value === "" ? null : Number(value)
          )
        : [];

      if (
        !playerId ||
        holes.length !== 18 ||
        holes.some((value) => value !== null && Number.isNaN(value))
      ) {
        return NextResponse.json(
          { error: "Each round entry needs a player and 18 hole values." },
          { status: 400 }
        );
      }

      if (
        holes.some(
          (value) =>
            value !== null && !holeScoreValues.includes(value as (typeof holeScoreValues)[number])
        )
      ) {
        return NextResponse.json(
          { error: "Hole values must be one of -1, 0, 1, 2, 4, or 6." },
          { status: 400 }
        );
      }

      if (team !== null && !teamOptions.includes(team as (typeof teamOptions)[number])) {
        return NextResponse.json({ error: "Team must be A, B, C, D, or E." }, { status: 400 });
      }

      if (seen.has(playerId)) {
        return NextResponse.json(
          { error: "Players can only appear once per round." },
          { status: 400 }
        );
      }

      seen.add(playerId);
    }

    await prisma.$transaction(async (tx) => {
      await createOrReplaceRoundEntries(tx, {
        roundId: id,
        roundName: resolvedRoundName,
        roundDate: new Date(roundDate),
        notes,
        teamCount,
        lockedAt,
        startedAt,
        forceComplete,
        entries: entries.map((entry: Record<string, unknown>) => ({
          playerId: String(entry.playerId),
          team:
            entry.team == null || entry.team === ""
              ? null
              : (String(entry.team) as (typeof teamOptions)[number]),
          groupNumber:
            entry.groupNumber == null || entry.groupNumber === ""
              ? null
              : Number(entry.groupNumber),
          teeTime: entry.teeTime == null || entry.teeTime === "" ? null : String(entry.teeTime),
          holes: Array.isArray(entry.holes)
            ? (entry.holes as unknown[]).map((value: unknown) =>
                value == null || value === "" ? null : Number(value)
              )
            : []
        }))
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save round." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const round = await prisma.round.findUnique({
      where: { id },
      select: {
        id: true,
        lockedAt: true,
        startedAt: true,
        completedAt: true
      }
    });

    if (!round) {
      return NextResponse.json({ error: "Round not found." }, { status: 404 });
    }

    if (round.lockedAt || round.startedAt || round.completedAt) {
      return NextResponse.json(
        { error: "Only unstarted rounds can be deleted." },
        { status: 400 }
      );
    }

    await prisma.round.delete({
      where: { id }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not delete round." },
      { status: 500 }
    );
  }
}
