import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getPlayersPageData } from "@/lib/data";
import { prisma } from "@/lib/prisma";

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

export async function GET() {
  const players = await getPlayersPageData();
  return NextResponse.json({ players });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const quota = Number(body.quota);
    const isRegular = Boolean(body.isRegular);
    const isActive = Boolean(body.isActive);
    const conflictIds = Array.isArray(body.conflictIds)
      ? body.conflictIds.map((value: unknown) => String(value))
      : [];

    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }

    if (Number.isNaN(quota)) {
      return NextResponse.json({ error: "Quota is required." }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      const player = await tx.player.create({
        data: {
          name,
          quota,
          isRegular,
          isActive
        }
      });

      await syncConflicts(tx, player.id, conflictIds);
    });

    const players = await getPlayersPageData();
    return NextResponse.json({ players });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create player." },
      { status: 500 }
    );
  }
}
