import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const action = String(body.action ?? "").trim();

    const round = await (prisma as any).round.findUnique({
      where: { id },
      include: {
        entries: {
          select: {
            playerId: true
          }
        }
      }
    });

    if (!round || round.canceledAt) {
      return NextResponse.json({ error: "Round not found." }, { status: 404 });
    }

    const isPayoutLocked = (round as { isPayoutLocked?: boolean }).isPayoutLocked ?? false;
    const paidPlayerIds = (round as { paidPlayerIds?: string[] }).paidPlayerIds ?? [];

    if (action === "toggle-paid") {
      if (isPayoutLocked) {
        return NextResponse.json(
          { error: "Payouts are locked for this round." },
          { status: 423 }
        );
      }

      const playerId = String(body.playerId ?? "").trim();
      const validPlayerIds = new Set(
        (round.entries as Array<{ playerId: string }>).map((entry) => entry.playerId)
      );

      if (!playerId || !validPlayerIds.has(playerId)) {
        return NextResponse.json({ error: "Player not found in this round." }, { status: 400 });
      }

      const nextPaidIds = paidPlayerIds.includes(playerId)
        ? paidPlayerIds.filter((id) => id !== playerId)
        : [...paidPlayerIds, playerId].sort((a, b) => a.localeCompare(b));

      const updatedRound = await (prisma as any).round.update({
        where: { id },
        data: {
          paidPlayerIds: nextPaidIds
        },
        select: {
          paidPlayerIds: true
        }
      });

      return NextResponse.json({
        ok: true,
        paidPlayerIds: updatedRound.paidPlayerIds
      });
    }

    if (action === "lock-payouts") {
      if (isPayoutLocked) {
        return NextResponse.json({ ok: true, isPayoutLocked: true });
      }

      const updatedRound = await (prisma as any).round.update({
        where: { id },
        data: {
          isPayoutLocked: true
        },
        select: {
          isPayoutLocked: true
        }
      });

      return NextResponse.json({
        ok: true,
        isPayoutLocked: updatedRound.isPayoutLocked
      });
    }

    return NextResponse.json({ error: "Unknown settlement action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update settlement state." },
      { status: 500 }
    );
  }
}
