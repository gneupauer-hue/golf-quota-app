import test from "node:test";
import assert from "node:assert/strict";
import {
  auditFirebasePlayerMirror,
  mapPrismaPlayerToFirebaseMirror,
  type PrismaPlayerMirrorInput
} from "@/lib/firebase/player-mirror";

const UPDATED_AT = new Date("2026-07-16T12:00:00.000Z");

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

test("maps a normal active player to the Firestore mirror shape", () => {
  const mirror = mapPrismaPlayerToFirebaseMirror(makePlayer());

  assert.equal(mirror.prismaPlayerId, "player-1");
  assert.equal(mirror.name, "Gary Neupauer");
  assert.equal(mirror.normalizedName, "gary neupauer");
  assert.equal(mirror.isActive, true);
  assert.equal(mirror.isRegular, true);
  assert.equal(mirror.currentQuota, 16);
  assert.equal(mirror.startingQuota, 18);
  assert.equal(mirror.storedQuota, 17);
  assert.equal(mirror.finalizedNonTestRoundCount, 4);
  assert.deepEqual(mirror.conflictPlayerIds, []);
  assert.equal(mirror.source, "prisma");
  assert.equal(mirror.prismaUpdatedAt, "2026-07-16T12:00:00.000Z");
  assert.equal(mirror.syncVersion, 1);
  assert.match(mirror.checksum, /^[a-f0-9]{64}$/);
});

test("maps an inactive player without changing quota fields", () => {
  const mirror = mapPrismaPlayerToFirebaseMirror(
    makePlayer({ isActive: false, isRegular: false })
  );

  assert.equal(mirror.isActive, false);
  assert.equal(mirror.isRegular, false);
  assert.equal(mirror.currentQuota, 16);
});

test("preserves nullable stored legacy quota separately from current quota", () => {
  const mirror = mapPrismaPlayerToFirebaseMirror(
    makePlayer({ quota: null, currentQuota: 22, startingQuota: 21 })
  );

  assert.equal(mirror.storedQuota, null);
  assert.equal(mirror.currentQuota, 22);
  assert.equal(mirror.startingQuota, 21);
});

test("uses currentQuota then quota then startingQuota operational fallback", () => {
  assert.equal(
    mapPrismaPlayerToFirebaseMirror(makePlayer({ currentQuota: 25, quota: 24, startingQuota: 23 }))
      .currentQuota,
    25
  );
  assert.equal(
    mapPrismaPlayerToFirebaseMirror(makePlayer({ currentQuota: null, quota: 24, startingQuota: 23 }))
      .currentQuota,
    24
  );
  assert.equal(
    mapPrismaPlayerToFirebaseMirror(makePlayer({ currentQuota: null, quota: null, startingQuota: 23 }))
      .currentQuota,
    23
  );
});

test("maps dormant/new-player synchronized quota values", () => {
  const mirror = mapPrismaPlayerToFirebaseMirror(
    makePlayer({
      quota: 34,
      currentQuota: 34,
      startingQuota: 34,
      _count: { roundEntries: 0 }
    })
  );

  assert.equal(mirror.currentQuota, 34);
  assert.equal(mirror.storedQuota, 34);
  assert.equal(mirror.startingQuota, 34);
  assert.equal(mirror.finalizedNonTestRoundCount, 0);
});

test("sorts, deduplicates, and self-filters conflict player IDs", () => {
  const mirror = mapPrismaPlayerToFirebaseMirror(
    makePlayer({
      id: "player-1",
      conflictsFrom: [
        { conflictPlayerId: "player-3" },
        { conflictPlayerId: "player-2" },
        { conflictPlayerId: "player-3" },
        { conflictPlayerId: "player-1" }
      ]
    })
  );

  assert.deepEqual(mirror.conflictPlayerIds, ["player-2", "player-3"]);
});

test("checksum is deterministic for identical Prisma data", () => {
  const left = mapPrismaPlayerToFirebaseMirror(makePlayer());
  const right = mapPrismaPlayerToFirebaseMirror(makePlayer());

  assert.equal(left.checksum, right.checksum);
  assert.deepEqual(left, right);
});

test("checksum changes when meaningful mirrored fields change", () => {
  const base = mapPrismaPlayerToFirebaseMirror(makePlayer());
  const changedPlayers = [
    makePlayer({ name: "Gary N." }),
    makePlayer({ currentQuota: 15 }),
    makePlayer({ startingQuota: 19 }),
    makePlayer({ quota: null }),
    makePlayer({ isActive: false }),
    makePlayer({ isRegular: false }),
    makePlayer({ conflictsFrom: [{ conflictPlayerId: "player-9" }] })
  ];

  for (const player of changedPlayers) {
    assert.notEqual(mapPrismaPlayerToFirebaseMirror(player).checksum, base.checksum);
  }
});

test("audit result is idempotent and does not mutate input arrays", () => {
  const prismaPlayers = [mapPrismaPlayerToFirebaseMirror(makePlayer())];
  const firestorePlayers = [
    { prismaPlayerId: prismaPlayers[0].prismaPlayerId, checksum: prismaPlayers[0].checksum }
  ];
  const prismaSnapshot = structuredClone(prismaPlayers);
  const firestoreSnapshot = structuredClone(firestorePlayers);

  const first = auditFirebasePlayerMirror(prismaPlayers, firestorePlayers);
  const second = auditFirebasePlayerMirror(prismaPlayers, firestorePlayers);

  assert.deepEqual(first, second);
  assert.deepEqual(prismaPlayers, prismaSnapshot);
  assert.deepEqual(firestorePlayers, firestoreSnapshot);
});

test("audit classifies created, updated, unchanged, and extra player mirrors", () => {
  const unchanged = mapPrismaPlayerToFirebaseMirror(makePlayer({ id: "unchanged" }));
  const updated = mapPrismaPlayerToFirebaseMirror(makePlayer({ id: "updated", currentQuota: 20 }));
  const created = mapPrismaPlayerToFirebaseMirror(makePlayer({ id: "created" }));
  const result = auditFirebasePlayerMirror(
    [updated, created, unchanged],
    [
      { prismaPlayerId: "unchanged", checksum: unchanged.checksum },
      { prismaPlayerId: "updated", checksum: "different-checksum" },
      { prismaPlayerId: "extra", checksum: "extra-checksum" }
    ]
  );

  assert.deepEqual(result.counts, {
    created: 1,
    updated: 1,
    unchanged: 1,
    extra: 1
  });
  assert.deepEqual(result.createdPlayerIds, ["created"]);
  assert.deepEqual(result.updatedPlayerIds, ["updated"]);
  assert.deepEqual(result.unchangedPlayerIds, ["unchanged"]);
  assert.deepEqual(result.extraPlayerIds, ["extra"]);
});
