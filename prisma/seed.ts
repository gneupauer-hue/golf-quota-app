import { PrismaClient } from "@prisma/client";
import { ensureStarterPlayers } from "../lib/seed-data";

const prisma = new PrismaClient();

async function main() {
  await ensureStarterPlayers(prisma);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
