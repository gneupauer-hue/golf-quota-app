import { NextResponse } from "next/server";

// Reflects the CURRENTLY DEPLOYED build. A client running stale code has an older
// baked-in SHA and compares it against this to know it needs to refresh.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      sha: process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev",
      builtAt: process.env.NEXT_PUBLIC_BUILD_TIME ?? null
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
