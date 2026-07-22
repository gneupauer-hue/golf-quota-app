import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { finalizeRound, getRoundCompletionPreview } from "@/lib/round-service";
import { formatRoundPostingPreflightError, validateRoundPostingPreflight } from "@/lib/round-preflight";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
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
    console.error("[round-complete] preview failed", { roundId: id, error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load quota adjustments." },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = (await request.json().catch(() => ({}))) as { override?: unknown };
    // Owner override: post despite a quota-audit mismatch (e.g. a pre-existing
    // history-chain discrepancy). Only the advisory QUOTA_PREVIEW_MISMATCH is
    // bypassable — missing/incomplete scores and structural errors still block.
    const override = body?.override === true;

    const preflight = await prisma.$transaction(async (tx) => {
      return validateRoundPostingPreflight(tx, id);
    });

    const blockingErrors = override
      ? preflight.errors.filter((issue) => issue.code !== "QUOTA_PREVIEW_MISMATCH")
      : preflight.errors;

    if (blockingErrors.length > 0) {
      return NextResponse.json(
        {
          error:
            formatRoundPostingPreflightError({ ...preflight, errors: blockingErrors }) ??
            "Round cannot be posted yet.",
          issues: blockingErrors,
          warnings: preflight.warnings,
          summary: preflight.summary
        },
        { status: 400 }
      );
    }

    if (override && preflight.errors.some((issue) => issue.code === "QUOTA_PREVIEW_MISMATCH")) {
      console.warn("[round-complete] owner override: posting despite quota audit mismatch", {
        roundId: id,
        overriddenIssues: preflight.errors.filter((issue) => issue.code === "QUOTA_PREVIEW_MISMATCH")
      });
    }

    console.info("[round-complete] preflight passed", {
      roundId: id,
      summary: preflight.summary,
      backupSnapshot: preflight.backupSnapshot
    });

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
    console.error("[round-complete] finalize failed", { roundId: id, error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not complete round." },
      { status: 500 }
    );
  }
}
