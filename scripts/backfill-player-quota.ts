import { prisma } from "@/lib/prisma";

async function main() {
  const players = await prisma.player.findMany({
    select: {
      id: true,
      name: true,
      quota: true,
      currentQuota: true,
      startingQuota: true
    },
    orderBy: {
      name: "asc"
    }
  });

  let updated = 0;

  for (const player of players) {
    const nextQuota = player.currentQuota ?? player.startingQuota;

    if (player.quota === nextQuota) {
      continue;
    }

    await prisma.player.update({
      where: { id: player.id },
      data: {
        quota: nextQuota
      }
    });

    updated += 1;
  }

  const verificationNames = [
    "Gary Neupauer",
    "Chad Kelly",
    "Jeff Hodorowski",
    "Rob Michaels"
  ];

  const verification = await prisma.player.findMany({
    where: {
      name: {
        in: verificationNames
      }
    },
    select: {
      name: true,
      quota: true,
      currentQuota: true,
      startingQuota: true
    },
    orderBy: {
      name: "asc"
    }
  });

  console.log(
    JSON.stringify(
      {
        scanned: players.length,
        updated,
        verification
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
