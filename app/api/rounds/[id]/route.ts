import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { holeScoreValues, normalizeBirdieHoles, teamOptions, type RoundMode, type ScoringEntryMode } from "@/lib/quota";
import {
  hasValidRoundScoreEditSession,
  ROUND_SCORE_EDIT_COOKIE
} from "@/lib/round-score-edit-auth";
import { createOrReplaceRoundEntries } from "@/lib/round-service";
import { formatRoundNameFromDate } from "@/lib/utils";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const round = await prisma.round.findUnique({
      where: { id },
      select: {
        id: true,
        createdAt: true,
        completedAt: true,
        lockedAt: true,
        startedAt: true,
        teamCount: true
      }
    });

    if (!round) {
      return NextResponse.json({ error: "Round not found." }, { status: 404 });
    }

    const entryCount = await prisma.roundEntry.count({
      where: { roundId: id }
    });

    return NextResponse.json({
      ok: true,
      refreshedAt: new Date().toISOString(),
      roundCreatedAt: round.createdAt.toISOString(),
      completedAt: round.completedAt?.toISOString() ?? null,
      lockedAt: round.lockedAt?.toISOString() ?? null,
      startedAt: round.startedAt?.toISOString() ?? null,
      teamCount: round.teamCount ?? null,
      entryCount
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not refresh round." },
      { status: 500 }
    );
  }
}

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
    const scoringEntryMode =
      body.scoringEntryMode === "QUICK" ? ("QUICK" as ScoringEntryMode) : ("DETAILED" as ScoringEntryMode);
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

    const existingRound = await (prisma as any).round.findUnique({
      where: { id }
    });

    if (!existingRound) {
      return NextResponse.json({ error: "Round not found." }, { status: 404 });
    }

    if ((existingRound as { isPayoutLocked?: boolean }).isPayoutLocked) {
      return NextResponse.json(
        { error: "Payouts are locked for this round." },
        { status: 423 }
      );
    }

    const existingEntries = await prisma.roundEntry.findMany({
      where: { roundId: id },
      select: {
        playerId: true,
        frontSubmittedAt: true,
        backSubmittedAt: true,
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
        hole18: true
      }
    });

    const existingEntryByPlayerId = new Map(
      existingEntries.map((entry) => [
        entry.playerId,
        {
          frontSubmittedAt: entry.frontSubmittedAt,
          backSubmittedAt: entry.backSubmittedAt,
          holes: [
            entry.hole1,
            entry.hole2,
            entry.hole3,
            entry.hole4,
            entry.hole5,
            entry.hole6,
            entry.hole7,
            entry.hole8,
            entry.hole9,
            entry.hole10,
            entry.hole11,
            entry.hole12,
            entry.hole13,
            entry.hole14,
            entry.hole15,
            entry.hole16,
            entry.hole17,
            entry.hole18
          ]
        }
      ])
    );

    let lockedScoreEditAttempted = false;
    const seen = new Set<string>();

    for (const entry of entries) {
      const playerId = String(entry.playerId ?? "").trim();
      const team = entry.team == null || entry.team === "" ? null : String(entry.team);
      const frontSubmittedAt =
        entry.frontSubmittedAt == null || entry.frontSubmittedAt === ""
          ? null
          : new Date(String(entry.frontSubmittedAt));
      const backSubmittedAt =
        entry.backSubmittedAt == null || entry.backSubmittedAt === ""
          ? null
          : new Date(String(entry.backSubmittedAt));
      const holes = Array.isArray(entry.holes)
        ? (entry.holes as unknown[]).map((value: unknown) =>
            value == null || value === "" ? null : Number(value)
          )
        : [];
      const quickFrontNine =
        entry.quickFrontNine == null || entry.quickFrontNine === "" ? null : Number(entry.quickFrontNine);
      const quickBackNine =
        entry.quickBackNine == null || entry.quickBackNine === "" ? null : Number(entry.quickBackNine);
      const rawBirdieHoles = Array.isArray(entry.birdieHoles)
        ? (entry.birdieHoles as unknown[]).map((value: unknown) => Number(value))
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

      if (scoringEntryMode === "QUICK") {
        if (
          (quickFrontNine !== null && (!Number.isInteger(quickFrontNine) || quickFrontNine < -9 || quickFrontNine > 54)) ||
          (quickBackNine !== null && (!Number.isInteger(quickBackNine) || quickBackNine < -9 || quickBackNine > 54))
        ) {
          return NextResponse.json(
            { error: "Quick Entry front and back totals must be whole-number point totals." },
            { status: 400 }
          );
        }

        if (rawBirdieHoles.some((value) => Number.isNaN(value) || !Number.isInteger(value) || value < 1 || value > 18)) {
          return NextResponse.json(
            { error: "Birdie holes must be hole numbers between 1 and 18." },
            { status: 400 }
          );
        }
      }

      const existingEntry = existingEntryByPlayerId.get(playerId);
      if (existingEntry) {
        const incomingHoles = holes.map((value) => (value == null ? null : Number(value)));
        const frontChanged = existingEntry.holes
          .slice(0, 9)
          .some((value, index) => value !== incomingHoles[index]);
        const anyChanged = existingEntry.holes.some((value, index) => value !== incomingHoles[index]);

        if (existingEntry.backSubmittedAt && anyChanged) {
          lockedScoreEditAttempted = true;
        } else if (existingEntry.frontSubmittedAt && frontChanged) {
          lockedScoreEditAttempted = true;
        }
      }

      if (seen.has(playerId)) {
        return NextResponse.json(
          { error: "Players can only appear once per round." },
          { status: 400 }
        );
      }

      if (frontSubmittedAt && Number.isNaN(frontSubmittedAt.getTime())) {
        return NextResponse.json(
          { error: "Front-nine submission time is invalid." },
          { status: 400 }
        );
      }

      if (backSubmittedAt && Number.isNaN(backSubmittedAt.getTime())) {
        return NextResponse.json(
          { error: "Back-nine submission time is invalid." },
          { status: 400 }
        );
      }

      seen.add(playerId);
    }

    if (lockedScoreEditAttempted) {
      const cookieStore = await cookies();
      if (!hasValidRoundScoreEditSession(cookieStore.get(ROUND_SCORE_EDIT_COOKIE)?.value)) {
        return NextResponse.json(
          { error: "Submitted scores are locked. Password required to edit them." },
          { status: 403 }
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      await createOrReplaceRoundEntries(tx, {
        roundId: id,
        roundName: resolvedRoundName,
        roundDate: new Date(roundDate),
        roundMode,
        scoringEntryMode,
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
          frontSubmittedAt:
            entry.frontSubmittedAt == null || entry.frontSubmittedAt === ""
              ? null
              : new Date(String(entry.frontSubmittedAt)),
          backSubmittedAt:
            entry.backSubmittedAt == null || entry.backSubmittedAt === ""
              ? null
              : new Date(String(entry.backSubmittedAt)),
          quickFrontNine:
            entry.quickFrontNine == null || entry.quickFrontNine === ""
              ? null
              : Number(entry.quickFrontNine),
          quickBackNine:
            entry.quickBackNine == null || entry.quickBackNine === ""
              ? null
              : Number(entry.quickBackNine),
          birdieHoles: Array.isArray(entry.birdieHoles)
            ? normalizeBirdieHoles((entry.birdieHoles as unknown[]).map((value: unknown) => Number(value)))
            : [],
          holes: Array.isArray(entry.holes)
            ? (entry.holes as unknown[]).map((value: unknown) =>
                value == null || value === "" ? null : Number(value)
              )
            : []
        }))
      });
    });

    console.info("[live-round] saved-round-payload", {
      roundId: id,
      roundDate,
      roundMode,
      scoringEntryMode,
      teamCount,
      entryCount: entries.length,
      entries: entries.map((entry: Record<string, unknown>) => ({
        playerId: String(entry.playerId ?? ""),
        team: entry.team == null || entry.team === "" ? null : String(entry.team),
        completedHoles: Array.isArray(entry.holes)
          ? (entry.holes as unknown[]).filter((value) => value != null && value !== "").length
          : 0,
        quickFrontNine:
          entry.quickFrontNine == null || entry.quickFrontNine === ""
            ? null
            : Number(entry.quickFrontNine),
        quickBackNine:
          entry.quickBackNine == null || entry.quickBackNine === ""
            ? null
            : Number(entry.quickBackNine),
        birdieHoleCount: Array.isArray(entry.birdieHoles) ? entry.birdieHoles.length : 0,
        frontSubmittedAt:
          entry.frontSubmittedAt == null || entry.frontSubmittedAt === ""
            ? null
            : String(entry.frontSubmittedAt),
        backSubmittedAt:
          entry.backSubmittedAt == null || entry.backSubmittedAt === ""
            ? null
            : String(entry.backSubmittedAt)
      }))
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
