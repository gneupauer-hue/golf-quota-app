import type { Prisma, PrismaClient } from "@prisma/client";
import { BASELINE_SEASON_START_2026 } from "@/lib/baseline-quotas-2026";

type Tx = Prisma.TransactionClient | PrismaClient;

const SEASON_CONFIG_ID = 1;

export async function getSeasonConfig(tx: Tx) {
  const config = await (tx as any).seasonConfig.upsert({
    where: { id: SEASON_CONFIG_ID },
    update: {},
    create: {
      id: SEASON_CONFIG_ID,
      seasonStartDate: BASELINE_SEASON_START_2026
    }
  });

  if (config.seasonStartDate.getTime() !== BASELINE_SEASON_START_2026.getTime()) {
    return (tx as any).seasonConfig.update({
      where: { id: SEASON_CONFIG_ID },
      data: {
        seasonStartDate: BASELINE_SEASON_START_2026
      }
    });
  }

  return config;
}

export async function getSeasonStartDate(tx: Tx) {
  const config = await getSeasonConfig(tx);
  return config.seasonStartDate;
}
