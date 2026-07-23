import { NextResponse } from "next/server";

const IREM_CLUB_ID = "eO5PwRmRZrQJW0VbEp0B";

// Lets a signed-in member set the name shown on the game board (and future
// texts). Fixes the "Member" fallback for accounts that never captured a name
// (e.g. the owner, who signed up by email).
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization") ?? "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { name?: unknown };
    const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    if (name.length < 2) {
      return NextResponse.json({ error: "Enter your name." }, { status: 400 });
    }
    if (name.length > 60) {
      return NextResponse.json({ error: "That name is too long." }, { status: 400 });
    }

    const { getFirebaseAdminAuth, getFirebaseAdminDb } = await import("@/lib/firebase/admin");
    const auth = await getFirebaseAdminAuth();
    const db = await getFirebaseAdminDb();

    const decoded = await auth.verifyIdToken(match[1]);
    const memberRef = db
      .collection("clubs")
      .doc(IREM_CLUB_ID)
      .collection("members")
      .doc(decoded.uid);
    const snapshot = await memberRef.get();
    if (!snapshot.exists) {
      return NextResponse.json({ error: "You're not a member of this club yet." }, { status: 403 });
    }

    await memberRef.set({ displayName: name }, { merge: true });
    return NextResponse.json({ ok: true, name });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save your name." },
      { status: 500 }
    );
  }
}
