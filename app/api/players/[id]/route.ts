import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentQuotaRows, getPlayersPageData } from "@/lib/data";
import { hasValidPlayerEditSession, PLAYER_EDIT_COOKIE } from "@/lib/player-edit-auth";
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

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    if (!hasValidPlayerEditSession(cookieStore.get(PLAYER_EDIT_COOKIE)?.value)) {
      return NextResponse.json({ error: "Editing requires the quota password." }, { status: 403 });
    }

    const { id } = await params;
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
      await tx.player.update({
        where: { id },
        data: {
          name,
          quota,
          currentQuota: quota,
          isRegular,
          isActive
        }
      });

      await syncConflicts(tx, id, conflictIds);
    });

    const data = await getPlayersPageData();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update player." },
      { status: 500 }
    );
  }
}
