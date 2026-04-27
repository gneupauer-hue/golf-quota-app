import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getPlayersPageData } from "@/lib/data";
import { hasValidPlayerEditSession, PLAYER_EDIT_COOKIE } from "@/lib/player-edit-auth";
import { prisma } from "@/lib/prisma";
import { recomputeHistoricalState } from "@/lib/round-service";

function canUseRepairTool(cookieValue: string | undefined) {
  return process.env.NODE_ENV !== "production" || hasValidPlayerEditSession(cookieValue);
}

export async function POST() {
  try {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(PLAYER_EDIT_COOKIE)?.value;

    if (!canUseRepairTool(cookieValue)) {
      return NextResponse.json(
        { error: "Quota recalculation requires admin access." },
        { status: 403 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await recomputeHistoricalState(tx);
    });

    const data = await getPlayersPageData();
    return NextResponse.json({
      ...data,
      message: data.quotaAudit.mismatchCount === 0
        ? "Quota history recalculated successfully."
        : `Quota recalculated with ${data.quotaAudit.mismatchCount} remaining mismatch${data.quotaAudit.mismatchCount === 1 ? "" : "es"}.`
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not recalculate quotas." },
      { status: 500 }
    );
  }
}
