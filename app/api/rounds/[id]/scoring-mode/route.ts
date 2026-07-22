import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Minimal, reliable update of just the round's scoring entry mode (no entry
// validation, no side effects) so switching to hole-by-hole can't fail on
// unrelated round data.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { mode?: unknown };
    const mode = body.mode === "QUICK" ? "QUICK" : "DETAILED";

    await prisma.round.update({
      where: { id },
      data: { scoringEntryMode: mode }
    });

    return NextResponse.json({ ok: true, scoringEntryMode: mode });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not change the scoring mode." },
      { status: 500 }
    );
  }
}
