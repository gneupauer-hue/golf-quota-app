import { NextResponse } from "next/server";
import { resolveActiveRound } from "@/lib/active-round";
import { prisma } from "@/lib/prisma";
import type { RoundMode } from "@/lib/quota";
import { formatRoundNameFromDate } from "@/lib/utils";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const roundDate = String(body.roundDate ?? "").trim();
    const roundName = String(body.roundName ?? "").trim();
    const notes = String(body.notes ?? "");
    const roundMode =
      body.roundMode === "SKINS_ONLY" ? ("SKINS_ONLY" as RoundMode) : ("MATCH_QUOTA" as RoundMode);
    const isTestRound = Boolean(body.isTestRound);

    if (!roundDate) {
      return NextResponse.json({ error: "Round date is required." }, { status: 400 });
    }

    const resolvedRoundName = roundName || formatRoundNameFromDate(roundDate);
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
        roundName: resolvedRoundName,
        roundDate: new Date(roundDate),
        roundMode,
        isTestRound,
        notes: notes.trim() ? notes.trim() : null
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
