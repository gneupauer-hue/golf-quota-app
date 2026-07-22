import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { teamOptions } from "@/lib/quota";

// Team-only reassignment for a live round. Updates each entry's team (and
// optional groupNumber) WITHOUT touching hole scores, so editing groups mid-round
// can never overwrite scores another phone is entering concurrently.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      teams?: Array<{ playerId?: unknown; team?: unknown; groupNumber?: unknown }>;
    };

    if (!Array.isArray(body.teams) || body.teams.length === 0) {
      return NextResponse.json({ error: "No team assignments provided." }, { status: 400 });
    }

    const updates = body.teams.map((item) => {
      const playerId = String(item.playerId ?? "");
      if (!playerId) {
        throw new Error("Each assignment needs a player.");
      }
      const team =
        item.team == null || item.team === ""
          ? null
          : (String(item.team) as (typeof teamOptions)[number]);
      if (team !== null && !teamOptions.includes(team)) {
        throw new Error("Team must be A, B, C, or D.");
      }
      const groupNumber =
        item.groupNumber == null || item.groupNumber === "" ? undefined : Number(item.groupNumber);
      return { playerId, team, groupNumber };
    });

    await prisma.$transaction(async (tx) => {
      for (const update of updates) {
        await tx.roundEntry.updateMany({
          where: { roundId: id, playerId: update.playerId },
          data: {
            team: update.team,
            ...(update.groupNumber === undefined ? {} : { groupNumber: update.groupNumber })
          }
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update groups." },
      { status: 400 }
    );
  }
}
