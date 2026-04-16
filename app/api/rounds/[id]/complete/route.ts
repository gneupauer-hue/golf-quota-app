import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { finalizeRound } from "@/lib/round-service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await prisma.$transaction(async (tx) => {
      await finalizeRound(tx, id);
    });

    return NextResponse.json({ ok: true, roundId: id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not complete round." },
      { status: 500 }
    );
  }
}
