import type { Prisma, PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

const SEASON_CONFIG_ID = 1;

export async function getSeasonConfig(tx: Tx) {
  return (tx as any).seasonConfig.upsert({
    where: { id: SEASON_CONFIG_ID },
    update: {},
    create: {
      id: SEASON_CONFIG_ID,
      seasonStartDate: new Date()
    }
  });
}

export async function getSeasonStartDate(tx: Tx) {
  const config = await getSeasonConfig(tx);
  return config.seasonStartDate;
}
