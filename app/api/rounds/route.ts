import { NextResponse } from "next/server";
import { resolveActiveRound } from "@/lib/active-round";
import { prisma } from "@/lib/prisma";
import type { RoundMode, ScoringEntryMode } from "@/lib/quota";
import { formatRoundNameFromDate } from "@/lib/utils";

// Turn a "YYYY-MM-DD" game date into a noon-UTC Date (timezone-safe). Returns
// null for anything that isn't a plain calendar date.
function parseGameDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const now = new Date();
    // Accept a chosen game date ("YYYY-MM-DD"); anchor to noon UTC so the day
    // never shifts across time zones. Fall back to now if absent/invalid.
    const roundDate = parseGameDate(body.roundDate) ?? now;
    const roundMode =
      body.roundMode === "SKINS_ONLY" ? ("SKINS_ONLY" as RoundMode) : ("MATCH_QUOTA" as RoundMode);
    const scoringEntryMode =
      body.scoringEntryMode === "QUICK" ? ("QUICK" as ScoringEntryMode) : ("DETAILED" as ScoringEntryMode);
    const isTestRound = Boolean(body.isTestRound);
    const activeRound = await resolveActiveRound(prisma);

    if (activeRound) {
      return NextResponse.json(
        {
          error: "Finish the current round before starting a new one.",
          activeRoundId: activeRound.id,
          activeRoundName: activeRound.roundName
        },
        { status: 409 }
      );
    }

    const round = await prisma.round.create({
      data: {
        roundName: formatRoundNameFromDate(roundDate),
        roundDate,
        roundMode,
        scoringEntryMode,
        isTestRound,
        notes: null
      }
    });

    return NextResponse.json({ round });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create round." },
      { status: 500 }
    );
  }
}
