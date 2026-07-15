import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getFirebaseAdminAuth, getFirebaseAdminDb } from "@/lib/firebase/admin";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function verifyBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    throw new Error("Sign in before creating a club.");
  }

  return getFirebaseAdminAuth().verifyIdToken(match[1]);
}

export async function POST(request: Request) {
  try {
    const decoded = await verifyBearerToken(request);
    const body = await request.json();
    const name = String(body.name ?? "").trim();

    if (!name) {
      return NextResponse.json({ error: "Club name is required." }, { status: 400 });
    }

    const db = getFirebaseAdminDb();
    const clubRef = db.collection("clubs").doc();
    const membershipId = `${decoded.uid}_${clubRef.id}`;
    const userRef = db.collection("users").doc(decoded.uid);
    const memberRef = clubRef.collection("members").doc(decoded.uid);
    const userMembershipRef = db.collection("userClubMemberships").doc(membershipId);
    const now = FieldValue.serverTimestamp();
    const email = decoded.email ?? null;
    const displayName = decoded.name ?? null;
    const photoURL = decoded.picture ?? null;

    await db.runTransaction(async (transaction) => {
      transaction.set(
        userRef,
        {
          uid: decoded.uid,
          email,
          displayName,
          photoURL,
          defaultClubId: clubRef.id,
          createdAt: now,
          updatedAt: now
        },
        { merge: true }
      );
      transaction.set(clubRef, {
        name,
        slug: slugify(name) || clubRef.id,
        app: "irem",
        status: "active",
        migrationPhase: 1,
        createdByUid: decoded.uid,
        ownerUid: decoded.uid,
        createdAt: now,
        updatedAt: now
      });
      transaction.set(memberRef, {
        uid: decoded.uid,
        email,
        displayName,
        role: "owner",
        status: "active",
        createdAt: now,
        updatedAt: now
      });
      transaction.set(userMembershipRef, {
        uid: decoded.uid,
        email,
        displayName,
        clubId: clubRef.id,
        clubName: name,
        role: "owner",
        status: "active",
        createdAt: now,
        updatedAt: now
      });
    });

    return NextResponse.json({
      ok: true,
      clubId: clubRef.id,
      clubName: name
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create club." },
      { status: 500 }
    );
  }
}
