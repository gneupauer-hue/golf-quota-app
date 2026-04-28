import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentQuotaRows, getPlayersPageData } from "@/lib/data";
import { hasValidPlayerEditSession, PLAYER_EDIT_COOKIE } from "@/lib/player-edit-auth";
import { prisma } from "@/lib/prisma";
import { recomputeHistoricalState } from "@/lib/round-service";

function canUseRepairTool(cookieValue: string | undefined) {
  return process.env.NODE_ENV !== "production" || hasValidPlayerEditSession(cookieValue);
}

const DEBUG_PLAYER_NAMES = ["John Thomas", "Bob Lipski", "Gary Neupauer"];

type DebugPlayerRow = {
  name: string;
  currentQuota: number | null;
  quota: number | null;
  startingQuota: number | null;
};

type DebugQuotaRow = {
  name: string;
  quota: number;
  persistedCurrentQuota: number;
};

function buildPlayerDebugSummary(
  playerName: string,
  beforePlayers: DebugPlayerRow[],
  afterPlayers: DebugPlayerRow[],
  currentQuotaRows: DebugQuotaRow[]
) {
  const before = beforePlayers.find((player) => player.name === playerName) ?? null;
  const after = afterPlayers.find((player) => player.name === playerName) ?? null;
  const expectedRow = currentQuotaRows.find((row) => row.name === playerName) ?? null;

  return {
    beforeCurrentQuota: before?.currentQuota ?? null,
    expectedCurrentQuota: expectedRow?.quota ?? null,
    afterCurrentQuota: after?.currentQuota ?? null,
    badgeQuota: expectedRow?.quota ?? null,
    persistedCurrentQuotaSeenByRows: expectedRow?.persistedCurrentQuota ?? null
  };
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

    const beforePlayers = await prisma.player.findMany({
      where: { name: { in: DEBUG_PLAYER_NAMES } },
      select: {
        id: true,
        name: true,
        currentQuota: true,
        quota: true,
        startingQuota: true
      }
    });

    const repair = await prisma.$transaction(async (tx) => {
      return recomputeHistoricalState(tx);
    });

    const [data, currentQuotaRows, afterPlayers] = await Promise.all([
      getPlayersPageData(),
      getCurrentQuotaRows(),
      prisma.player.findMany({
        where: { name: { in: DEBUG_PLAYER_NAMES } },
        select: {
          id: true,
          name: true,
          currentQuota: true,
          quota: true,
          startingQuota: true
        }
      })
    ]);

    const johnThomas = buildPlayerDebugSummary(
      "John Thomas",
      beforePlayers,
      afterPlayers,
      currentQuotaRows
    );
    const bobLipski = buildPlayerDebugSummary(
      "Bob Lipski",
      beforePlayers,
      afterPlayers,
      currentQuotaRows
    );
    const garyNeupauer = buildPlayerDebugSummary(
      "Gary Neupauer",
      beforePlayers,
      afterPlayers,
      currentQuotaRows
    );

    console.info("[quota-rebuild] POST-REBUILD DB VALUE", {
      johnThomas,
      bobLipski,
      garyNeupauer
    });

    const debugPlayers: Array<[string, ReturnType<typeof buildPlayerDebugSummary>]> = [
      ["John Thomas", johnThomas],
      ["Bob Lipski", bobLipski],
      ["Gary Neupauer", garyNeupauer]
    ];

    const failedDiagnostics = debugPlayers.filter(
      ([, item]) => item.expectedCurrentQuota != null && item.afterCurrentQuota !== item.expectedCurrentQuota
    );

    if (failedDiagnostics.length > 0) {
      return NextResponse.json(
        {
          ...data,
          currentQuotaRows,
          repair,
          debug: {
            endpointHit: true,
            databaseReadAfterCommit: true,
            johnThomas,
            bobLipski,
            garyNeupauer
          },
          error:
            "Rebuild completed, but persisted currentQuota still does not match expected values for: " +
            failedDiagnostics.map(([playerName]) => playerName).join(", ") +
            "."
        },
        { status: 500 }
      );
    }

    if (data.quotaAudit.mismatchCount > 0) {
      return NextResponse.json(
        {
          ...data,
          currentQuotaRows,
          repair,
          debug: {
            endpointHit: true,
            databaseReadAfterCommit: true,
            johnThomas,
            bobLipski,
            garyNeupauer
          },
          error: `Rebuild wrote data, but ${data.quotaAudit.mismatchCount} quota mismatch${data.quotaAudit.mismatchCount === 1 ? " remains" : "es remain"}.`
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ...data,
      currentQuotaRows,
      repair,
      debug: {
        endpointHit: true,
        databaseReadAfterCommit: true,
        johnThomas,
        bobLipski,
        garyNeupauer
      },
      message: `Updated ${repair.playersUpdated} player${repair.playersUpdated === 1 ? "" : "s"} and ${repair.roundEntriesUpdated} round record${repair.roundEntriesUpdated === 1 ? "" : "s"}. 0 quota mismatches found.`
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not rebuild quotas from baseline." },
      { status: 500 }
    );
  }
}

