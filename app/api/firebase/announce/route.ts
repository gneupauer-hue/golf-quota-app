import { NextResponse } from "next/server";
import { isSmsConfigured, sendSms } from "@/lib/sms/twilio";

const IREM_CLUB_ID = "eO5PwRmRZrQJW0VbEp0B";

// Owner-only: text a game announcement to every active member who opted in to
// game texts. Dormant until Twilio is configured.
export async function POST(request: Request) {
  try {
    if (!isSmsConfigured()) {
      return NextResponse.json(
        { error: "Texting isn't set up yet. Add your Twilio keys first." },
        { status: 400 }
      );
    }

    const authHeader = request.headers.get("authorization") ?? "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    }
    const idToken = match[1];

    const body = (await request.json().catch(() => ({}))) as { message?: unknown };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return NextResponse.json({ error: "Enter a message to send." }, { status: 400 });
    }
    if (message.length > 640) {
      return NextResponse.json({ error: "Message is too long (max 640 characters)." }, { status: 400 });
    }

    const { getFirebaseAdminAuth, getFirebaseAdminDb } = await import("@/lib/firebase/admin");
    const auth = await getFirebaseAdminAuth();
    const db = await getFirebaseAdminDb();

    const decoded = await auth.verifyIdToken(idToken);
    const meSnapshot = await db
      .collection("clubs")
      .doc(IREM_CLUB_ID)
      .collection("members")
      .doc(decoded.uid)
      .get();
    const me = meSnapshot.exists ? (meSnapshot.data() as { role?: string; status?: string } | undefined) : null;
    if (!me || me.status !== "active" || (me.role !== "owner" && me.role !== "admin")) {
      return NextResponse.json({ error: "Only the club owner can send announcements." }, { status: 403 });
    }

    const membersSnapshot = await db
      .collection("clubs")
      .doc(IREM_CLUB_ID)
      .collection("members")
      .where("status", "==", "active")
      .get();

    const recipients = membersSnapshot.docs
      .map((doc) => doc.data() as { gameTextConsent?: unknown; phoneNumber?: unknown })
      .filter(
        (member) =>
          member?.gameTextConsent === true &&
          typeof member.phoneNumber === "string" &&
          member.phoneNumber.trim().length > 0
      )
      .map((member) => (member.phoneNumber as string).trim());

    let sent = 0;
    let failed = 0;
    for (const to of recipients) {
      try {
        await sendSms({ to, body: message });
        sent += 1;
      } catch {
        failed += 1;
      }
    }

    return NextResponse.json({ ok: true, sent, failed, total: recipients.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not send the announcement." },
      { status: 500 }
    );
  }
}
