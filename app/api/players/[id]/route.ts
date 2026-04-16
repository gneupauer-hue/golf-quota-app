import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getPlayersPageData } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { recomputeHistoricalState } from "@/lib/round-service";

async function syncConflicts(
  tx: Prisma.TransactionClient,
  playerId: string,
  conflictIds: string[]
) {
  await tx.playerConflict.deleteMany({
    where: {
      OR: [{ playerId }, { conflictPlayerId: playerId }]
    }
  });

  const uniqueIds = [...new Set(conflictIds)].filter((id) => id !== playerId);
  for (const conflictId of uniqueIds) {
    await tx.playerConflict.create({
      data: { playerId, conflictPlayerId: conflictId }
    });
    await tx.playerConflict.create({
      data: { playerId: conflictId, conflictPlayerId: playerId }
    });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const startingQuota = Number(body.startingQuota);
    const currentQuota = Number(body.currentQuota);
    const isRegular = Boolean(body.isRegular);
    const isActive = Boolean(body.isActive);
    const conflictIds = Array.isArray(body.conflictIds)
      ? body.conflictIds.map((value: unknown) => String(value))
      : [];

    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }

    if (Number.isNaN(startingQuota)) {
      return NextResponse.json({ error: "Starting quota is required." }, { status: 400 });
    }

    if (Number.isNaN(currentQuota)) {
      return NextResponse.json({ error: "Current quota is required." }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.player.update({
        where: { id },
        data: {
          name,
          startingQuota,
          isRegular,
          isActive
        }
      });

      await syncConflicts(tx, id, conflictIds);
      await recomputeHistoricalState(tx);
      await tx.player.update({
        where: { id },
        data: {
          currentQuota
        }
      });
    });

    const players = await getPlayersPageData();
    return NextResponse.json({ players });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update player." },
      { status: 500 }
    );
  }
}
