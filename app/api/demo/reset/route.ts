import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppMode } from "@/lib/app-mode";
import { resetDemoData } from "@/lib/seed-data";

export async function POST() {
  try {
    if (getAppMode() !== "demo") {
      return NextResponse.json(
        { error: "Demo reset is only available in demo mode." },
        { status: 403 }
      );
    }

    await resetDemoData(prisma);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not reset demo data." },
      { status: 500 }
    );
  }
}
