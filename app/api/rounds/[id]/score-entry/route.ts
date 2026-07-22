import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyScoreEntryPatches, type ScoreEntryPatch } from "@/lib/round-service";
import { assertCanEnterScores } from "@/lib/firebase/score-access";
import { isApprovedScorerRequired } from "@/lib/firebase/score-access-rollout";
import { IREM_FIREBASE_CLUB_ID } from "@/lib/firebase/active-round-preparation";
import type { MembershipLike } from "@/lib/firebase/club-membership";

const FIREBASE_SESSION_COOKIE = "firebase_session";

// When the approved-scorer flag is on, only a signed-in owner-approved member may
// write scores. Fails closed. Prisma remains authoritative for the scores themselves.
async function requireApprovedScorer(sessionCookie: string | undefined) {
  const { getFirebaseAdminAuth, getFirebaseAdminDb } = await import("@/lib/firebase/admin");
  const auth = await getFirebaseAdminAuth();
  const db = await getFirebaseAdminDb();

  await assertCanEnterScores({
    clubId: IREM_FIREBASE_CLUB_ID,
    sessionCookie,
    adapters: {
      verifySessionCookie: async (cookie) => {
        try {
          const decoded = await auth.verifySessionCookie(cookie, true);
          return { uid: decoded.uid };
        } catch {
          return null;
        }
      },
      readMembership: async (clubId, uid) => {
        const snapshot = await db
          .collection("clubs")
          .doc(clubId)
          .collection("members")
          .doc(uid)
          .get();
        return snapshot.exists ? ((snapshot.data() as MembershipLike | undefined) ?? null) : null;
      }
    }
  });
}

function parseOptionalDate(value: unknown) {
  if (value == null || value === "") {
    return null;
  }

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error("Score submission time is invalid.");
  }

  return date;
}

function parseScoreEntry(value: unknown): ScoreEntryPatch {
  if (!value || typeof value !== "object") {
    throw new Error("Each score entry needs a player.");
  }

  const entry = value as Record<string, unknown>;
  const playerId = String(entry.playerId ?? "").trim();

  if (!playerId) {
    throw new Error("Each score entry needs a player.");
  }

  const holes = Array.isArray(entry.holes)
    ? entry.holes.map((score) => (score == null || score === "" ? null : Number(score)))
    : undefined;
  const holeScores = Array.isArray(entry.holeScores)
    ? entry.holeScores.map((item) => {
        if (!item || typeof item !== "object") {
          throw new Error("Hole score updates need a hole and score.");
        }

        const update = item as Record<string, unknown>;
        return {
          holeNumber: Number(update.holeNumber),
          score: update.score == null || update.score === "" ? null : Number(update.score)
        };
      })
    : undefined;
  const quickFrontNine =
    entry.quickFrontNine === undefined
      ? undefined
      : entry.quickFrontNine == null || entry.quickFrontNine === ""
        ? null
        : Number(entry.quickFrontNine);
  const quickBackNine =
    entry.quickBackNine === undefined
      ? undefined
      : entry.quickBackNine == null || entry.quickBackNine === ""
        ? null
        : Number(entry.quickBackNine);

  if (holes?.some((score) => score !== null && Number.isNaN(score))) {
    throw new Error("Hole scores must be numbers.");
  }

  if (holeScores?.some((score) => Number.isNaN(score.holeNumber) || (score.score !== null && Number.isNaN(score.score)))) {
    throw new Error("Hole score updates must be numbers.");
  }

  if (quickFrontNine !== undefined && quickFrontNine !== null && Number.isNaN(quickFrontNine)) {
    throw new Error("Front nine must be a number.");
  }

  if (quickBackNine !== undefined && quickBackNine !== null && Number.isNaN(quickBackNine)) {
    throw new Error("Back nine must be a number.");
  }

  return {
    playerId,
    holeScores,
    holes,
    quickFrontNine,
    quickBackNine,
    birdieHoles: Array.isArray(entry.birdieHoles)
      ? entry.birdieHoles.map((item) => String(item))
      : undefined,
    frontSubmittedAt:
      entry.frontSubmittedAt === undefined ? undefined : parseOptionalDate(entry.frontSubmittedAt),
    backSubmittedAt:
      entry.backSubmittedAt === undefined ? undefined : parseOptionalDate(entry.backSubmittedAt)
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const entries = Array.isArray(body.entries) ? body.entries.map(parseScoreEntry) : [];

    if (!entries.length) {
      return NextResponse.json({ error: "At least one score entry is required." }, { status: 400 });
    }

    const cookieStore = await cookies();

    if (isApprovedScorerRequired()) {
      await requireApprovedScorer(cookieStore.get(FIREBASE_SESSION_COOKIE)?.value);
    }

    // Submitted front/back nines are freely editable now — no password. Posted
    // (completed) rounds remain locked separately in applyScoreEntryPatches, so
    // this only frees corrections while a round is still live.
    const allowLockedScoreEdit = true;

    await prisma.$transaction(async (tx) => {
      await applyScoreEntryPatches(tx, {
        roundId: id,
        entries,
        allowLockedScoreEdit
      });
    }, { maxWait: 10000, timeout: 30000 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error && typeof error.status === "number"
        ? error.status
        : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save scores." },
      { status }
    );
  }
}
