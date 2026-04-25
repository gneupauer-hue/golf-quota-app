import { NextResponse } from "next/server";
import { PLAYER_EDIT_COOKIE, PLAYER_EDIT_PASSWORD } from "@/lib/player-edit-auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const password = String(body.password ?? "");

    if (password !== PLAYER_EDIT_PASSWORD) {
      return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: PLAYER_EDIT_COOKIE,
      value: "1",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/"
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Could not unlock editing." }, { status: 500 });
  }
}
