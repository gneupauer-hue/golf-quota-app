import { NextResponse } from "next/server";
import {
  APP_URL,
  IREM_CLUB_ID,
  getGameTextRecipients,
  requireActiveMember,
  statusOf
} from "@/lib/games/game-auth";
import { buildNewGameText, isUpcoming, normalizeGameInput, sortGamesByStart } from "@/lib/games/game-core";
import { isSmsConfigured, sendSms } from "@/lib/sms/twilio";

export const dynamic = "force-dynamic";

type RsvpRow = { uid: string; displayName: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readRsvps(db: any, gameId: string): Promise<RsvpRow[]> {
  const snapshot = await db
    .collection("clubs")
    .doc(IREM_CLUB_ID)
    .collection("games")
    .doc(gameId)
    .collection("rsvps")
    .get();
  return snapshot.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((doc: any) => doc.data() as { uid?: string; displayName?: string; going?: boolean })
    .filter((rsvp: { going?: boolean }) => rsvp.going === true)
    .map((rsvp: { uid?: string; displayName?: string }) => ({
      uid: rsvp.uid ?? "",
      displayName: rsvp.displayName ?? "Member"
    }));
}

/** Upcoming games with who's in, and whether you're in. */
export async function GET(request: Request) {
  try {
    const me = await requireActiveMember(request);
    const snapshot = await me.db
      .collection("clubs")
      .doc(IREM_CLUB_ID)
      .collection("games")
      .get();

    const now = new Date();
    const games = snapshot.docs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((doc: any) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }))
      .filter((game: Record<string, unknown>) => !game.canceledAt)
      .filter((game: Record<string, unknown>) =>
        isUpcoming({ course: String(game.course ?? ""), date: String(game.date ?? ""), time: String(game.time ?? "") }, now)
      );

    const withRsvps = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      games.map(async (game: any) => {
        const rsvps = await readRsvps(me.db, game.id);
        const guestSnapshot = await me.db
          .collection("clubs")
          .doc(IREM_CLUB_ID)
          .collection("games")
          .doc(game.id)
          .collection("guests")
          .get();
        const guests = guestSnapshot.docs
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((doc: any) => {
            const data = doc.data() as Record<string, unknown>;
            return {
              id: doc.id,
              name: String(data.name ?? ""),
              handicap: Number(data.handicap ?? 0),
              tee: String(data.tee ?? "GREEN"),
              quota: Number(data.quota ?? 0),
              phone: typeof data.phone === "string" ? data.phone : null
            };
          });
        return {
          id: game.id,
          course: String(game.course ?? ""),
          date: String(game.date ?? ""),
          time: String(game.time ?? ""),
          note: typeof game.note === "string" ? game.note : "",
          createdByUid: String(game.createdByUid ?? ""),
          createdByName: String(game.createdByName ?? ""),
          createdAt: String(game.createdAt ?? ""),
          going: [
            ...rsvps.map((rsvp) => rsvp.displayName),
            ...guests.map((guest: { name: string }) => `${guest.name} (guest)`)
          ],
          guests,
          youAreIn: rsvps.some((rsvp) => rsvp.uid === me.uid)
        };
      })
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sorted = sortGamesByStart(withRsvps as any);
    return NextResponse.json({ ok: true, games: sorted, isOwner: me.isOwner, uid: me.uid });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load games." },
      { status: statusOf(error) }
    );
  }
}

/** Create a game, then text everyone who opted in. */
export async function POST(request: Request) {
  try {
    const me = await requireActiveMember(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const input = normalizeGameInput(body);

    const createdAt = new Date().toISOString();
    const gameRef = await me.db
      .collection("clubs")
      .doc(IREM_CLUB_ID)
      .collection("games")
      .add({
        ...input,
        note: input.note ?? "",
        createdByUid: me.uid,
        createdByName: me.displayName,
        createdAt,
        canceledAt: null
      });

    // Best-effort blast — never fails the create.
    let texted = 0;
    if (isSmsConfigured()) {
      const recipients = await getGameTextRecipients(me.db);
      const message = buildNewGameText(input, APP_URL);
      for (const to of recipients) {
        try {
          await sendSms({ to, body: message });
          texted += 1;
        } catch {
          // ignore individual failures
        }
      }
    }

    return NextResponse.json({ ok: true, id: gameRef.id, texted });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create the game." },
      { status: statusOf(error) }
    );
  }
}
