import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { finalizeRound } from "@/lib/round-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const playerId = String(body.playerId ?? "").trim();
    const segment = body.segment === "front" ? "front" : body.segment === "back" ? "back" : null;

    if (!playerId || !segment) {
      return NextResponse.json({ error: "Player and segment are required." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const round = await tx.round.findUnique({
        where: { id },
        select: {
          id: true,
          completedAt: true,
          canceledAt: true,
          isPayoutLocked: true
        }
      });

      if (!round) {
        throw new Error("Round not found.");
      }

      if (round.canceledAt) {
        throw new Error("This round has been canceled.");
      }

      if (round.completedAt) {
        return { completed: true, allFrontSubmitted: true, allBackSubmitted: true };
      }

      if (round.isPayoutLocked) {
        throw new Error("Payouts are locked for this round.");
      }

      const entry = await tx.roundEntry.findUnique({
        where: {
          roundId_playerId: {
            roundId: id,
            playerId
          }
        },
        select: {
          id: true,
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

      if (!entry) {
        throw new Error("Round entry not found.");
      }

      const frontScores = [
        entry.hole1,
        entry.hole2,
        entry.hole3,
        entry.hole4,
        entry.hole5,
        entry.hole6,
        entry.hole7,
        entry.hole8,
        entry.hole9
      ];
      const backScores = [
        entry.hole10,
        entry.hole11,
        entry.hole12,
        entry.hole13,
        entry.hole14,
        entry.hole15,
        entry.hole16,
        entry.hole17,
        entry.hole18
      ];

      if (segment === "front" && frontScores.some((score) => score == null)) {
        throw new Error("All front-nine holes must be saved before submission.");
      }

      if (segment === "back") {
        if (!entry.frontSubmittedAt) {
          throw new Error("Front nine must be submitted before back nine.");
        }

        if (backScores.some((score) => score == null)) {
          throw new Error("All back-nine holes must be saved before submission.");
        }
      }

      const now = new Date();
      await tx.roundEntry.update({
        where: { id: entry.id },
        data:
          segment === "front"
            ? { frontSubmittedAt: entry.frontSubmittedAt ?? now }
            : { backSubmittedAt: entry.backSubmittedAt ?? now }
      });

      const [allFrontSubmitted, allBackSubmitted] = await Promise.all([
        tx.roundEntry.count({
          where: { roundId: id, frontSubmittedAt: null }
        }),
        tx.roundEntry.count({
          where: { roundId: id, backSubmittedAt: null }
        })
      ]);

      const shouldFinalize = segment === "back" && allBackSubmitted === 0;

      if (shouldFinalize) {
        await finalizeRound(tx, id);
      }

      return {
        completed: shouldFinalize,
        allFrontSubmitted: allFrontSubmitted === 0,
        allBackSubmitted: allBackSubmitted === 0
      };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not submit this segment."
      },
      { status: 500 }
    );
  }
}
