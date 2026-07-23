import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { IREM_CLUB_ID, requireActiveMember, statusOf } from "@/lib/games/game-auth";
import { resolveActiveRound } from "@/lib/active-round";
import { formatRoundNameFromDate } from "@/lib/utils";
import { createOrReplaceRoundEntries } from "@/lib/round-service";
import type { RoundMode, ScoringEntryMode } from "@/lib/quota";

export const dynamic = "force-dynamic";

function parseGameDate(value: unknown): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date();
  }
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Start a scoring round from a game, pre-loaded with everyone who RSVP'd "in"
 * (matched to the roster by name). Names not on the roster are reported back as
 * guests to add. Leaves the round in setup state so the owner builds teams and
 * starts it as usual.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const me = await requireActiveMember(request);

    const gameSnapshot = await me.db
      .collection("clubs")
      .doc(IREM_CLUB_ID)
      .collection("games")
      .doc(id)
      .get();
    if (!gameSnapshot.exists) {
      return NextResponse.json({ error: "That game was not found." }, { status: 404 });
    }
    const game = gameSnapshot.data() as { date?: unknown; createdByUid?: unknown };
    if (!me.isOwner && String(game.createdByUid ?? "") !== me.uid) {
      return NextResponse.json(
        { error: "Only the owner or whoever set up the game can start the round." },
        { status: 403 }
      );
    }

    const rsvpSnapshot = await me.db
      .collection("clubs")
      .doc(IREM_CLUB_ID)
      .collection("games")
      .doc(id)
      .collection("rsvps")
      .get();
    const goingNames: string[] = rsvpSnapshot.docs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((doc: any) => doc.data() as { displayName?: unknown; going?: boolean })
      .filter((rsvp: { going?: boolean }) => rsvp.going === true)
      .map((rsvp: { displayName?: unknown }) => String(rsvp.displayName ?? "").trim())
      .filter(Boolean);

    const roster = await prisma.player.findMany({
      where: { isActive: true },
      select: { id: true, name: true, defaultTee: true }
    });
    const byNormalizedName = new Map(roster.map((player) => [normalizeName(player.name), player]));

    const matched: Array<{ id: string; name: string; defaultTee: string }> = [];
    const unmatched: string[] = [];
    for (const name of goingNames) {
      const player = byNormalizedName.get(normalizeName(name));
      if (player) {
        matched.push(player);
      } else {
        unmatched.push(name);
      }
    }

    const active = await resolveActiveRound(prisma);
    if (active) {
      return NextResponse.json(
        { error: "Finish the current round before starting a new one.", activeRoundId: active.id },
        { status: 409 }
      );
    }

    const roundDate = parseGameDate(game.date);
    const roundMode: RoundMode = "MATCH_QUOTA";
    const scoringEntryMode: ScoringEntryMode = "DETAILED";

    const roundId = await prisma.$transaction(
      async (tx) => {
        const round = await tx.round.create({
          data: {
            roundName: formatRoundNameFromDate(roundDate),
            roundDate,
            roundMode,
            scoringEntryMode,
            isTestRound: false,
            notes: null
          }
        });

        if (matched.length) {
          await createOrReplaceRoundEntries(tx, {
            roundId: round.id,
            roundName: round.roundName,
            roundDate,
            roundMode,
            scoringEntryMode,
            replaceMissingEntries: true,
            updateRoundMetadata: false,
            entries: matched.map((player) => ({
              playerId: player.id,
              team: null,
              playingTee: player.defaultTee,
              holes: Array<number | null>(18).fill(null)
            }))
          });
        }

        return round.id;
      },
      { timeout: 30000, maxWait: 10000 }
    );

    return NextResponse.json({
      ok: true,
      roundId,
      matched: matched.map((player) => player.name),
      unmatched
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start the round." },
      { status: statusOf(error) }
    );
  }
}
