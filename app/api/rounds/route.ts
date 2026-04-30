import { NextResponse } from "next/server";
import { resolveActiveRound } from "@/lib/active-round";
import { prisma } from "@/lib/prisma";
import type { RoundMode, ScoringEntryMode } from "@/lib/quota";
import { formatRoundNameFromDate } from "@/lib/utils";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const now = new Date();
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
        roundName: formatRoundNameFromDate(now),
        roundDate: now,
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
