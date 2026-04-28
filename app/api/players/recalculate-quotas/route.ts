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
        { error: "Baseline quota rebuild requires admin access." },
        { status: 403 }
      );
    }

    const repair = await prisma.$transaction(async (tx) => {
      return recomputeHistoricalState(tx);
    });

    const data = await getPlayersPageData();
    const updatedLabel = `${repair.playersUpdated} player${repair.playersUpdated === 1 ? "" : "s"} and ${repair.roundsProcessed} round${repair.roundsProcessed === 1 ? "" : "s"}`;

    return NextResponse.json({
      ...data,
      repair,
      message: data.quotaAudit.mismatchCount === 0
        ? `Rebuilt quotas for ${updatedLabel}. 0 quota mismatches found.`
        : `Rebuilt quotas for ${updatedLabel}, but ${data.quotaAudit.mismatchCount} mismatch${data.quotaAudit.mismatchCount === 1 ? " remains" : "es remain"}.`
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not rebuild quotas from baseline." },
      { status: 500 }
    );
  }
}
