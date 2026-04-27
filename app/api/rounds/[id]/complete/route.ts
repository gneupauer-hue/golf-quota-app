import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { finalizeRound, getRoundCompletionPreview } from "@/lib/round-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const preview = await prisma.$transaction(async (tx) => {
      return getRoundCompletionPreview(tx, id);
    });

    return NextResponse.json({
      ok: true,
      isTestRound: preview.isTestRound,
      readOnly: preview.readOnly,
      approvedAt: preview.approvedAt,
      warning: preview.warning,
      rows: preview.rows
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load quota adjustments." },
      { status: 500 }
    );
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const finalizedRound = await prisma.$transaction(async (tx) => {
      await finalizeRound(tx, id);

      return tx.round.findUnique({
        where: { id },
        select: {
          id: true,
          completedAt: true,
          canceledAt: true
        }
      });
    });

    if (!finalizedRound || !finalizedRound.completedAt || finalizedRound.canceledAt) {
      throw new Error("Round finalization did not complete successfully.");
    }

    revalidatePath("/");
    revalidatePath("/current-round");
    revalidatePath("/past-games");
    revalidatePath("/players");
    revalidatePath(`/rounds/${id}`);
    revalidatePath(`/rounds/${id}/results`);

    return NextResponse.json({
      ok: true,
      roundId: id,
      completedAt: finalizedRound.completedAt.toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not complete round." },
      { status: 500 }
    );
  }
}


