import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentQuotaRows, getPlayersPageData } from "@/lib/data";
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

    const [data, currentQuotaRows, verifyPlayers] = await Promise.all([
      getPlayersPageData(),
      getCurrentQuotaRows(),
      prisma.player.findMany({
        select: {
          id: true,
          name: true,
          currentQuota: true,
          quota: true,
          startingQuota: true
        }
      })
    ]);
    const updatedLabel = `${repair.playersUpdated} player${repair.playersUpdated === 1 ? "" : "s"} and ${repair.roundEntriesUpdated} round record${repair.roundEntriesUpdated === 1 ? "" : "s"}`;

    const johnThomas = verifyPlayers.find((player) => player.name === "John Thomas");
    console.info("[quota-rebuild] POST-REBUILD DB VALUE", {
      playerName: "John Thomas",
      currentQuota: johnThomas?.currentQuota ?? null,
      quota: johnThomas?.quota ?? null,
      startingQuota: johnThomas?.startingQuota ?? null
    });

    if (data.quotaAudit.mismatchCount > 0) {
      return NextResponse.json(
        {
          ...data,
          currentQuotaRows,
          repair,
          error: `Rebuild wrote data, but ${data.quotaAudit.mismatchCount} quota mismatch${data.quotaAudit.mismatchCount === 1 ? " remains" : "es remain"}.`
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ...data,
      currentQuotaRows,
      repair,
      message: `Updated ${updatedLabel}. 0 quota mismatches found.`
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not rebuild quotas from baseline." },
      { status: 500 }
    );
  }
}
