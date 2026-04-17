import { NextResponse } from "next/server";
import { getPlayersPageData } from "@/lib/data";
import {
  livePlayerQuotaReset,
  livePlayerQuotaResetConfirmation,
  livePlayerQuotaResetMap,
  livePlayerQuotaResetVerificationNames
} from "@/lib/live-player-quota-reset";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const confirmation = String(body.confirmation ?? "").trim();

    if (confirmation !== livePlayerQuotaResetConfirmation) {
      return NextResponse.json(
        {
          error: `Type "${livePlayerQuotaResetConfirmation}" to confirm the live quota reset.`
        },
        { status: 400 }
      );
    }

    const names = livePlayerQuotaReset.map(([name]) => name);
    const existingPlayers = await prisma.player.findMany({
      where: {
        name: {
          in: names
        }
      },
      select: {
        id: true,
        name: true
      }
    });

    const existingByName = new Map(existingPlayers.map((player) => [player.name, player]));
    const notFound = names.filter((name) => !existingByName.has(name));

    await prisma.$transaction(
      existingPlayers.map((player) =>
        prisma.player.update({
          where: {
            id: player.id
          },
          data: {
            quota: livePlayerQuotaResetMap.get(player.name) ?? null
          }
        })
      )
    );

    const verification = await prisma.player.findMany({
      where: {
        name: {
          in: [...livePlayerQuotaResetVerificationNames]
        }
      },
      select: {
        name: true,
        quota: true
      },
      orderBy: {
        name: "asc"
      }
    });

    const players = await getPlayersPageData();

    return NextResponse.json({
      ok: true,
      updatedCount: existingPlayers.length,
      notFound,
      verification,
      players
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not reset live player quotas."
      },
      { status: 500 }
    );
  }
}
