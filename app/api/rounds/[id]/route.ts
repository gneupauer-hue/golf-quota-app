import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { holeScoreValues, teamOptions, type RoundMode } from "@/lib/quota";
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
    const roundMode =
      body.roundMode === "SKINS_ONLY" ? ("SKINS_ONLY" as RoundMode) : ("MATCH_QUOTA" as RoundMode);
    const isTestRound = Boolean(body.isTestRound);
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

    if (
      roundMode === "MATCH_QUOTA" &&
      teamCount !== null &&
      (Number.isNaN(teamCount) || teamCount < 2 || teamCount > teamOptions.length)
    ) {
      return NextResponse.json(
        { error: `Team count must be between 2 and ${teamOptions.length}.` },
        { status: 400 }
      );
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
        roundMode,
        isTestRound,
        notes,
        teamCount: roundMode === "SKINS_ONLY" ? null : teamCount,
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
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const forceDelete = url.searchParams.get("force") === "1";
    const round = await prisma.round.findUnique({
      where: { id },
      select: {
        id: true,
        isTestRound: true,
        lockedAt: true,
        startedAt: true,
        completedAt: true,
        canceledAt: true
      }
    });

    if (!round) {
      return NextResponse.json({ error: "Round not found." }, { status: 404 });
    }

    if (round.canceledAt) {
      return NextResponse.json({ ok: true });
    }

    if (round.completedAt) {
      return NextResponse.json(
        { error: "Completed rounds cannot be deleted from the live flow." },
        { status: 400 }
      );
    }

    const savedScoreCount = await prisma.roundEntry.count({
      where: {
        roundId: id,
        OR: [
          { hole1: { not: null } },
          { hole2: { not: null } },
          { hole3: { not: null } },
          { hole4: { not: null } },
          { hole5: { not: null } },
          { hole6: { not: null } },
          { hole7: { not: null } },
          { hole8: { not: null } },
          { hole9: { not: null } },
          { hole10: { not: null } },
          { hole11: { not: null } },
          { hole12: { not: null } },
          { hole13: { not: null } },
          { hole14: { not: null } },
          { hole15: { not: null } },
          { hole16: { not: null } },
          { hole17: { not: null } },
          { hole18: { not: null } }
        ]
      }
    });

    if (savedScoreCount > 0 && !forceDelete && !round.isTestRound) {
      return NextResponse.json(
        {
          error:
            "This round already has saved scores. Complete it instead of deleting it."
        },
        { status: 400 }
      );
    }

    if (forceDelete && round.completedAt) {
      return NextResponse.json(
        { error: "Completed rounds cannot be force-cleared from the live flow." },
        { status: 400 }
      );
    }

    if (round.isTestRound) {
      await prisma.round.delete({
        where: { id }
      });
    } else if (savedScoreCount > 0 && forceDelete) {
      await prisma.round.update({
        where: { id },
        data: {
          canceledAt: new Date(),
          lockedAt: null,
          startedAt: null
        }
      });
    } else {
      await prisma.round.delete({
        where: { id }
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not delete round." },
      { status: 500 }
    );
  }
}
