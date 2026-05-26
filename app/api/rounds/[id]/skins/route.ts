import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  formatGoodSkinEntriesInput,
  goodSkinTypeLabels,
  parseGoodSkinEntriesInput,
  type GoodSkinEntry,
  type GoodSkinType
} from "@/lib/quota";
import { syncRoundComputedState } from "@/lib/round-service";

const goodSkinTypes = new Set<GoodSkinType>(["birdie", "eagle", "ace"]);

function normalizeSkinEntriesInput(value: unknown): GoodSkinEntry[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const entries: GoodSkinEntry[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      return null;
    }

    const entry = item as { holeNumber?: unknown; type?: unknown };
    const holeNumber = Number(entry.holeNumber);
    const type = String(entry.type ?? "") as GoodSkinType;

    if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18 || !goodSkinTypes.has(type)) {
      return null;
    }

    entries.push({
      holeNumber,
      type,
      score: type === "ace" ? 8 : type === "eagle" ? 6 : 4
    });
  }

  return parseGoodSkinEntriesInput(entries);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const playerId = String(body.playerId ?? "").trim();
    const goodSkinEntries = normalizeSkinEntriesInput(body.goodSkinEntries);

    if (!playerId || !goodSkinEntries) {
      return NextResponse.json(
        { error: "Choose a player, hole, and skin type." },
        { status: 400 }
      );
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
        throw new Error("Canceled rounds cannot be edited.");
      }

      if (round.completedAt) {
        throw new Error("Skins can only be edited before finalizing the round.");
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
          id: true
        }
      });

      if (!entry) {
        throw new Error("Player is not in this round.");
      }

      const savedValue = formatGoodSkinEntriesInput(goodSkinEntries);
      await tx.roundEntry.update({
        where: { id: entry.id },
        data: {
          birdieHolesCsv: savedValue
        }
      });

      await syncRoundComputedState(tx, id);

      return parseGoodSkinEntriesInput(savedValue);
    });

    return NextResponse.json({
      ok: true,
      goodSkinEntries: result,
      summary: result.map((entry) => `Hole ${entry.holeNumber} - ${goodSkinTypeLabels[entry.type]}`)
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update skins." },
      { status: 500 }
    );
  }
}
