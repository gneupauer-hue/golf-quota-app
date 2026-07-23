import { NextResponse } from "next/server";
import { APP_URL, IREM_CLUB_ID, requireActiveMember, statusOf } from "@/lib/games/game-auth";
import { buildGameChangedText, normalizeGameInput, type GameInput } from "@/lib/games/game-core";
import { isSmsConfigured, sendSms } from "@/lib/sms/twilio";

export const dynamic = "force-dynamic";

/**
 * Update a game. If the date, time, or course changed, text everyone who said
 * they're IN — that's the whole point: a change can't get buried in a group chat.
 * Editing only the note doesn't text anyone.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const me = await requireActiveMember(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const gameRef = me.db.collection("clubs").doc(IREM_CLUB_ID).collection("games").doc(id);
    const snapshot = await gameRef.get();
    if (!snapshot.exists) {
      return NextResponse.json({ error: "That game was not found." }, { status: 404 });
    }
    const existing = snapshot.data() as Record<string, unknown>;

    // Only the owner or whoever created the game can change or cancel it.
    if (!me.isOwner && String(existing.createdByUid ?? "") !== me.uid) {
      return NextResponse.json(
        { error: "Only the owner or whoever set up the game can change it." },
        { status: 403 }
      );
    }

    // Cancel path.
    if (body.cancel === true) {
      await gameRef.set({ canceledAt: new Date().toISOString() }, { merge: true });
      return NextResponse.json({ ok: true, canceled: true });
    }

    const before: GameInput = {
      course: String(existing.course ?? ""),
      date: String(existing.date ?? ""),
      time: String(existing.time ?? ""),
      note: typeof existing.note === "string" ? existing.note : ""
    };
    const after = normalizeGameInput(body);

    await gameRef.set({ ...after, note: after.note ?? "" }, { merge: true });

    const changeText = buildGameChangedText(before, after, APP_URL);
    let texted = 0;
    if (changeText && isSmsConfigured()) {
      // Text the guys who are IN — they're the ones the change affects.
      const rsvpSnapshot = await gameRef.collection("rsvps").get();
      const goingUids: string[] = rsvpSnapshot.docs
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((doc: any) => doc.data() as { uid?: string; going?: boolean })
        .filter((rsvp: { going?: boolean }) => rsvp.going === true)
        .map((rsvp: { uid?: string }) => rsvp.uid ?? "")
        .filter(Boolean);

      for (const uid of goingUids) {
        try {
          const memberSnapshot = await me.db
            .collection("clubs")
            .doc(IREM_CLUB_ID)
            .collection("members")
            .doc(uid)
            .get();
          const phone = memberSnapshot.exists
            ? (memberSnapshot.data() as { phoneNumber?: unknown })?.phoneNumber
            : null;
          if (typeof phone === "string" && phone.trim()) {
            await sendSms({ to: phone.trim(), body: changeText });
            texted += 1;
          }
        } catch {
          // ignore individual failures
        }
      }
    }

    return NextResponse.json({ ok: true, changed: Boolean(changeText), texted });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update the game." },
      { status: statusOf(error) }
    );
  }
}
