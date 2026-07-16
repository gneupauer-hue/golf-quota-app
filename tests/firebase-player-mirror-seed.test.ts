import test from "node:test";
import assert from "node:assert/strict";
import {
  IREM_FIREBASE_PROJECT_ID,
  formatPlayerMirrorSeedReport,
  runPlayerMirrorSeed,
  type PlayerMirrorSeedAdapters,
  type PlayerMirrorSeedOptions
} from "@/lib/firebase/player-mirror-seed";
import { mapPrismaPlayerToFirebaseMirror, type PrismaPlayerMirrorInput } from "@/lib/firebase/player-mirror";

const UPDATED_AT = new Date("2026-07-16T12:00:00.000Z");

function makeOptions(overrides: Partial<PlayerMirrorSeedOptions> = {}): PlayerMirrorSeedOptions {
  return {
    projectId: IREM_FIREBASE_PROJECT_ID,
    clubId: "club-1",
    write: false,
    confirmProductionWrite: false,
    ...overrides
  };
}

function makePlayer(overrides: Partial<PrismaPlayerMirrorInput> = {}): PrismaPlayerMirrorInput {
  return {
    id: "player-1",
    name: "Gary Neupauer",
    quota: 17,
    currentQuota: 16,
    startingQuota: 18,
    isActive: true,
    isRegular: true,
    updatedAt: UPDATED_AT,
    conflictsFrom: [],
    _count: { roundEntries: 4 },
    ...overrides
  };
}

function makeAdapters(overrides: Partial<PlayerMirrorSeedAdapters> = {}): PlayerMirrorSeedAdapters {
  return {
    verifyClub: async (clubId) => ({ id: clubId, name: "Irem Golf Quota" }),
    readPrismaPlayers: async () => [makePlayer()],
    readFirestorePlayers: async () => [],
    ...overrides
  };
}

test("dry-run never writes", async () => {
  let writeCount = 0;
  const result = await runPlayerMirrorSeed(
    makeOptions(),
    makeAdapters({
      writePlayerMirrors: async () => {
        writeCount += 1;
      }
    })
  );

  assert.equal(writeCount, 0);
  assert.equal(result.dryRun, true);
  assert.equal(result.writesPlanned, 0);
  assert.equal(result.writesApplied, 0);
});

test("write flag is required before write adapter runs", async () => {
  let writeCount = 0;
  await runPlayerMirrorSeed(
    makeOptions({ confirmProductionWrite: true }),
    makeAdapters({
      writePlayerMirrors: async () => {
        writeCount += 1;
      }
    })
  );

  assert.equal(writeCount, 0);
});

test("production writes require second explicit confirmation flag", async () => {
  await assert.rejects(
    () =>
      runPlayerMirrorSeed(
        makeOptions({ write: true, confirmProductionWrite: false }),
        makeAdapters({ writePlayerMirrors: async () => undefined })
      ),
    /confirm-production-write/
  );
});

test("wrong Firebase project is rejected", async () => {
  await assert.rejects(
    () => runPlayerMirrorSeed(makeOptions({ projectId: "wrong-project" }), makeAdapters()),
    /Refusing to run/
  );
});

test("missing club is rejected", async () => {
  await assert.rejects(
    () =>
      runPlayerMirrorSeed(
        makeOptions(),
        makeAdapters({
          verifyClub: async () => null
        })
      ),
    /was not found/
  );
});

test("reports created, updated, unchanged, and extra documents", async () => {
  const unchanged = makePlayer({ id: "unchanged", name: "Unchanged Player" });
  const updated = makePlayer({ id: "updated", name: "Updated Player", currentQuota: 20 });
  const created = makePlayer({ id: "created", name: "Created Player" });
  const unchangedMirror = mapPrismaPlayerToFirebaseMirror(unchanged);
  const result = await runPlayerMirrorSeed(
    makeOptions(),
    makeAdapters({
      readPrismaPlayers: async () => [updated, created, unchanged],
      readFirestorePlayers: async () => [
        { prismaPlayerId: "unchanged", checksum: unchangedMirror.checksum },
        { prismaPlayerId: "updated", checksum: "old-checksum" },
        { prismaPlayerId: "extra", checksum: "extra-checksum" }
      ]
    })
  );

  assert.deepEqual(result.audit.counts, {
    created: 1,
    updated: 1,
    unchanged: 1,
    extra: 1
  });
  assert.deepEqual(result.players.created, [{ id: "created", name: "Created Player" }]);
  assert.deepEqual(result.players.updated, [{ id: "updated", name: "Updated Player" }]);
  assert.deepEqual(result.players.unchanged, [{ id: "unchanged", name: "Unchanged Player" }]);
  assert.deepEqual(result.players.extra, [{ id: "extra", name: "(Firestore-only document)" }]);
});

test("repeated dry-run is idempotent", async () => {
  const adapters = makeAdapters();
  const first = await runPlayerMirrorSeed(makeOptions(), adapters);
  const second = await runPlayerMirrorSeed(makeOptions(), adapters);

  assert.deepEqual(first, second);
});

test("does not mutate input data", async () => {
  const prismaPlayers = [makePlayer()];
  const firestorePlayers = [{ prismaPlayerId: "player-1", checksum: "old-checksum" }];
  const prismaSnapshot = structuredClone(prismaPlayers);
  const firestoreSnapshot = structuredClone(firestorePlayers);

  await runPlayerMirrorSeed(
    makeOptions(),
    makeAdapters({
      readPrismaPlayers: async () => prismaPlayers,
      readFirestorePlayers: async () => firestorePlayers
    })
  );

  assert.deepEqual(prismaPlayers, prismaSnapshot);
  assert.deepEqual(firestorePlayers, firestoreSnapshot);
});

test("report contains counts and player IDs without checksum values", async () => {
  const result = await runPlayerMirrorSeed(makeOptions(), makeAdapters());
  const report = formatPlayerMirrorSeedReport(result);

  assert.match(report, /Firebase project: irem-golf-quota-app/);
  assert.match(report, /Club ID: club-1/);
  assert.match(report, /Created: 1/);
  assert.match(report, /Gary Neupauer \(player-1\)/);
  assert.doesNotMatch(report, /[a-f0-9]{64}/);
});
