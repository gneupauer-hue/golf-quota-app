import { NextResponse } from "next/server";
import { getPlayersPageData } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { ensureStarterPlayers } from "@/lib/seed-data";

export async function POST() {
  try {
    await ensureStarterPlayers(prisma);
    const players = await getPlayersPageData();

    return NextResponse.json({
      ok: true,
      players
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not restore starter players."
      },
      { status: 500 }
    );
  }
}
