import { NextResponse } from "next/server";
import { IREM_CLUB_ID, requireActiveMember, statusOf } from "@/lib/games/game-auth";
import { guestQuotaFromHandicap } from "@/lib/games/game-core";

export const dynamic = "force-dynamic";

const TEES = ["BLACK", "GREEN", "YELLOW", "WHITE"];

/** Add a guest to a game (name + handicap + tee, optional phone/quota override). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const me = await requireActiveMember(request);
    const body = (await request.json().catch(() => ({}))) as {
      name?: unknown;
      handicap?: unknown;
      tee?: unknown;
      quota?: unknown;
      phone?: unknown;
    };

    const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    if (name.length < 2) {
      return NextResponse.json({ error: "Enter the guest's name." }, { status: 400 });
    }
    const handicap = Number(body.handicap);
    if (!Number.isFinite(handicap) || handicap < -10 || handicap > 54) {
      return NextResponse.json({ error: "Enter a valid handicap." }, { status: 400 });
    }
    const tee = typeof body.tee === "string" && TEES.includes(body.tee.toUpperCase())
      ? body.tee.toUpperCase()
      : "GREEN";
    const overrideQuota = Number(body.quota);
    const quota = Number.isFinite(overrideQuota) && overrideQuota > 0
      ? Math.round(overrideQuota)
      : guestQuotaFromHandicap(handicap, tee);
    const phone = typeof body.phone === "string" && body.phone.trim() ? body.phone.trim() : null;

    const gameRef = me.db.collection("clubs").doc(IREM_CLUB_ID).collection("games").doc(id);
    if (!(await gameRef.get()).exists) {
      return NextResponse.json({ error: "That game was not found." }, { status: 404 });
    }

    const guestRef = await gameRef.collection("guests").add({
      name,
      handicap: Math.round(handicap),
      tee,
      quota,
      phone,
      addedByUid: me.uid,
      addedAt: new Date().toISOString()
    });

    return NextResponse.json({ ok: true, id: guestRef.id, quota });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not add the guest." },
      { status: statusOf(error) }
    );
  }
}

/** Remove a guest from a game. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const me = await requireActiveMember(request);
    const guestId = new URL(request.url).searchParams.get("guestId") ?? "";
    if (!guestId) {
      return NextResponse.json({ error: "Missing guest." }, { status: 400 });
    }
    await me.db
      .collection("clubs")
      .doc(IREM_CLUB_ID)
      .collection("games")
      .doc(id)
      .collection("guests")
      .doc(guestId)
      .delete();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not remove the guest." },
      { status: statusOf(error) }
    );
  }
}
