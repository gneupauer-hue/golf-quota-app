import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

async function verifyBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    throw new Error("Sign in before syncing a Firebase profile.");
  }

  const { getFirebaseAdminAuth } = await import("@/lib/firebase/admin");

  return (await getFirebaseAdminAuth()).verifyIdToken(match[1]);
}

export async function POST(request: Request) {
  try {
    const decoded = await verifyBearerToken(request);
    const { getFirebaseAdminDb } = await import("@/lib/firebase/admin");
    const db = await getFirebaseAdminDb();
    const userRef = db.collection("users").doc(decoded.uid);
    const snapshot = await userRef.get();
    const now = FieldValue.serverTimestamp();

    await userRef.set(
      {
        uid: decoded.uid,
        email: decoded.email ?? null,
        displayName: decoded.name ?? null,
        photoURL: decoded.picture ?? null,
        ...(snapshot.exists ? {} : { createdAt: now }),
        updatedAt: now
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, uid: decoded.uid });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not sync Firebase profile." },
      { status: 500 }
    );
  }
}
