import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  formatGoodSkinEntriesInput,
  type GoodSkinEntry,
  type GoodSkinType
} from "@/lib/quota";
import { recomputeHistoricalState, syncRoundComputedState } from "@/lib/round-service";

const LATEST_ROUND_ONLY_MESSAGE =
  "Only the most recent finalized round can be edited right now to protect quota history.";
const FINALIZED_SCORE_EDIT_PASSWORD = "irem";

const goodSkinTypeScores: Record<GoodSkinType, number> = {
  birdie: 4,
  eagle: 6,
  ace: 8
};

const goodSkinTypeAliases: Record<string, GoodSkinType> = {
  birdie: "birdie",
  "4": "birdie",
  eagle: "eagle",
  "6": "eagle",
  ace: "ace",
  hio: "ace",
  "hole-in-one": "ace",
  holeinone: "ace",
  "8": "ace"
};

class HttpError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function parseScore(value: unknown, label: string) {
  const score = Number(value);

  if (!Number.isInteger(score) || score < -9 || score > 54) {
    throw new HttpError(`${label} must be a whole number between -9 and 54.`);
  }

  return score;
}

function parseSkinToken(value: string): GoodSkinEntry {
  const [rawHole, rawType] = value.split(":").map((part) => part.trim());
  const holeNumber = Number(rawHole);
  const type = goodSkinTypeAliases[(rawType ?? "").toLowerCase()];

  if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18 || !type) {
    throw new HttpError("Skin entries must use hole:type, like 4:birdie or 11:eagle.");
  }

  return {
    holeNumber,
    type,
    score: goodSkinTypeScores[type]
  };
}

function normalizeSkinEntries(value: unknown): GoodSkinEntry[] {
  if (value == null || value === "") {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new HttpError("Skin entries must be a list.");
  }

  const entries = value.map((item) => {
    if (typeof item === "string") {
      return parseSkinToken(item);
    }

    if (!item || typeof item !== "object") {
      throw new HttpError("Skin entries must include a hole and type.");
    }

    const skin = item as { holeNumber?: unknown; type?: unknown };
    const holeNumber = Number(skin.holeNumber);
    const type = goodSkinTypeAliases[String(skin.type ?? "").toLowerCase()];

    if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18 || !type) {
      throw new HttpError("Skin entries must include a valid hole and type.");
    }

    return {
      holeNumber,
      type,
      score: goodSkinTypeScores[type]
    };
  });

  const byHole = new Map<number, GoodSkinEntry>();
  for (const entry of entries) {
    const current = byHole.get(entry.holeNumber);
    if (!current || entry.score > current.score) {
      byHole.set(entry.holeNumber, entry);
    }
  }

  return Array.from(byHole.values()).sort((left, right) => left.holeNumber - right.holeNumber);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const corrections = Array.isArray(body.entries) ? body.entries : null;
    const adminPassword = String(body.adminPassword ?? "");

    if (!corrections) {
      throw new HttpError("Round corrections must include player entries.");
    }

    if (adminPassword !== FINALIZED_SCORE_EDIT_PASSWORD) {
      throw new HttpError("Incorrect password", 403);
    }

    await prisma.$transaction(async (tx) => {
      const round = await tx.round.findUnique({
        where: { id },
        select: {
          id: true,
          roundMode: true,
          completedAt: true,
          canceledAt: true,
          isTestRound: true
        }
      });

      if (!round) {
        throw new HttpError("Round not found.", 404);
      }

      if (round.canceledAt) {
        throw new HttpError("Canceled rounds cannot be edited.");
      }

      if (!round.completedAt) {
        throw new HttpError("Only finalized rounds can be corrected.");
      }

      if (!round.isTestRound) {
        const latestRound = await tx.round.findFirst({
          where: {
            completedAt: {
              not: null
            },
            canceledAt: null,
            isTestRound: false
          },
          orderBy: [{ completedAt: "desc" }, { roundDate: "desc" }, { createdAt: "desc" }],
          select: {
            id: true
          }
        });

        if (latestRound?.id !== id) {
          throw new HttpError(LATEST_ROUND_ONLY_MESSAGE, 409);
        }
      }

      const entries = await tx.roundEntry.findMany({
        where: { roundId: id },
        select: {
          id: true,
          playerId: true,
          frontSubmittedAt: true,
          backSubmittedAt: true
        }
      });
      const entriesByPlayerId = new Map(entries.map((entry) => [entry.playerId, entry]));
      const now = new Date();

      for (const correction of corrections) {
        if (!correction || typeof correction !== "object") {
          throw new HttpError("Every correction must include a player.");
        }

        const row = correction as {
          playerId?: unknown;
          frontNine?: unknown;
          backNine?: unknown;
          goodSkinEntries?: unknown;
        };
        const playerId = String(row.playerId ?? "").trim();
        const entry = entriesByPlayerId.get(playerId);

        if (!entry) {
          throw new HttpError("A corrected player is not in this round.");
        }

        const isIndividualQuotaSkins = round.roundMode === "SKINS_ONLY";
        const quickFrontNine = parseScore(row.frontNine, isIndividualQuotaSkins ? "Total" : "Front");
        const quickBackNine = isIndividualQuotaSkins ? null : parseScore(row.backNine, "Back");
        const goodSkinEntries = normalizeSkinEntries(row.goodSkinEntries);

        await tx.roundEntry.update({
          where: { id: entry.id },
          data: {
            quickFrontNine,
            quickBackNine,
            birdieHolesCsv: formatGoodSkinEntriesInput(goodSkinEntries),
            frontSubmittedAt: entry.frontSubmittedAt ?? now,
            backSubmittedAt: entry.backSubmittedAt ?? now
          }
        });
      }

      await syncRoundComputedState(tx, id);

      if (!round.isTestRound) {
        await recomputeHistoricalState(tx);
      }
    }, { maxWait: 10000, timeout: 30000 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save round corrections." },
      { status }
    );
  }
}
