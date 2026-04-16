import { PrismaClient } from "@prisma/client";
import { resetDemoData } from "../lib/seed-data";

const prisma = new PrismaClient();

async function main() {
  await resetDemoData(prisma);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
