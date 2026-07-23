import { NextResponse } from "next/server";
import { IREM_CLUB_ID, requireActiveMember, statusOf } from "@/lib/games/game-auth";

export const dynamic = "force-dynamic";

/** One-tap "I'm in" (and undo). No response at all just means not on the list. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const me = await requireActiveMember(request);
    const body = (await request.json().catch(() => ({}))) as { going?: unknown };
    const going = body.going === true;

    const rsvpRef = me.db
      .collection("clubs")
      .doc(IREM_CLUB_ID)
      .collection("games")
      .doc(id)
      .collection("rsvps")
      .doc(me.uid);

    await rsvpRef.set(
      {
        uid: me.uid,
        displayName: me.displayName,
        going,
        respondedAt: new Date().toISOString()
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, going });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save your RSVP." },
      { status: statusOf(error) }
    );
  }
}
