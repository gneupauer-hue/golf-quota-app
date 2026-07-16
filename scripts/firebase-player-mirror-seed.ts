import { FieldValue } from "firebase-admin/firestore";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { prisma } from "@/lib/prisma";
import {
  IREM_FIREBASE_PROJECT_ID,
  assertPlayerMirrorSeedSafety,
  formatPlayerMirrorSeedReport,
  runPlayerMirrorSeed,
  type PlayerMirrorSeedOptions
} from "@/lib/firebase/player-mirror-seed";
import type { FirebasePlayerMirror } from "@/lib/firebase/types";

function getArgValue(args: string[], name: string) {
  const index = args.indexOf(name);

  if (index === -1) {
    return null;
  }

  return args[index + 1] ?? "";
}

function hasFlag(args: string[], name: string) {
  return args.includes(name);
}

function parseArgs(args: string[]): PlayerMirrorSeedOptions {
  const projectId = getArgValue(args, "--project") ?? "";
  const clubId = getArgValue(args, "--club") ?? "";

  return {
    projectId,
    clubId,
    write: hasFlag(args, "--write"),
    confirmProductionWrite: hasFlag(args, "--confirm-production-write"),
    expectedProjectId: IREM_FIREBASE_PROJECT_ID
  };
}

async function readPrismaPlayers() {
  return prisma.player.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      quota: true,
      currentQuota: true,
      startingQuota: true,
      isActive: true,
      isRegular: true,
      updatedAt: true,
      conflictsFrom: {
        select: {
          conflictPlayerId: true
        }
      },
      _count: {
        select: {
          roundEntries: {
            where: {
              round: {
                completedAt: { not: null },
                canceledAt: null,
                isTestRound: false
              }
            }
          }
        }
      }
    }
  });
}

async function getFirestoreDb(projectId: string) {
  const existingApp = getApps().find((app) => app.name === "firebase-player-mirror-seed");
  const app =
    existingApp ??
    initializeApp(
      {
        credential: applicationDefault(),
        projectId
      },
      "firebase-player-mirror-seed"
    );

  return getFirestore(app);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  console.log(`Firebase project: ${options.projectId || "(missing)"}`);
  console.log(`Club ID: ${options.clubId || "(missing)"}`);
  console.log(`Mode: ${options.write ? "write" : "dry-run"}`);

  assertPlayerMirrorSeedSafety(options);

  const db = await getFirestoreDb(options.projectId);
  const result = await runPlayerMirrorSeed(options, {
    verifyClub: async (clubId) => {
      const snapshot = await db.collection("clubs").doc(clubId).get();

      if (!snapshot.exists) {
        return null;
      }

      const data = snapshot.data() as { name?: string | null } | undefined;
      return {
        id: clubId,
        name: data?.name ?? null
      };
    },
    readPrismaPlayers,
    readFirestorePlayers: async (clubId) => {
      const snapshot = await db.collection("clubs").doc(clubId).collection("players").get();

      return snapshot.docs.map((doc) => {
        const data = doc.data() as { prismaPlayerId?: unknown; checksum?: unknown };

        return {
          prismaPlayerId: typeof data.prismaPlayerId === "string" ? data.prismaPlayerId : doc.id,
          checksum: typeof data.checksum === "string" ? data.checksum : ""
        };
      });
    },
    writePlayerMirrors: async (clubId, players: FirebasePlayerMirror[]) => {
      const batch = db.batch();
      const collection = db.collection("clubs").doc(clubId).collection("players");

      for (const player of players) {
        batch.set(collection.doc(player.prismaPlayerId), {
          ...player,
          syncedAt: FieldValue.serverTimestamp()
        });
      }

      await batch.commit();
    }
  });

  console.log(formatPlayerMirrorSeedReport(result));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Player mirror seed failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
