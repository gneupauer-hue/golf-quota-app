import test from "node:test";
import assert from "node:assert/strict";
import {
  auditFirebaseRoundMirror,
  mapPrismaRoundStatus,
  mapPrismaRoundToFirebaseMirror,
  type PrismaRoundMirrorInput
} from "@/lib/firebase/round-mirror";

const CREATED_AT = new Date("2026-07-16T12:00:00.000Z");
const UPDATED_AT = new Date("2026-07-16T12:05:00.000Z");

function makeEntry(overrides: Partial<PrismaRoundMirrorInput["entries"][number]> = {}) {
  return {
    id: "entry-1",
    playerId: "player-1",
    player: {
      id: "player-1",
      name: "Gary Neupauer",
      quota: 17,
      currentQuota: 16,
      startingQuota: 18,
      isActive: true,
      isRegular: true
    },
    startQuota: 18,
    team: "A",
    groupNumber: 1,
    teeTime: "9:00 AM",
    ...overrides
  };
}

function makeRound(overrides: Partial<PrismaRoundMirrorInput> = {}): PrismaRoundMirrorInput {
  return {
    id: "round-1",
    roundName: "July 18, 2026",
    roundDate: "2026-07-18T13:00:00.000Z",
    roundMode: "MATCH_QUOTA",
    scoringEntryMode: "QUICK",
    isTestRound: false,
    teamCount: 4,
    notes: " Saturday round ",
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    entries: [
      makeEntry(),
      makeEntry({
        id: "entry-2",
        playerId: "player-2",
        player: {
          id: "player-2",
          name: "Joe Rubbico",
          quota: 20,
          currentQuota: null,
          startingQuota: 19,
          isActive: true,
          isRegular: false
        },
        startQuota: 19,
        team: "B",
        groupNumber: 1,
        teeTime: "9:00 AM"
      })
    ],
    ...overrides
  };
}

test("maps a setup Prisma round to the deterministic Firestore mirror shape", () => {
  const mirror = mapPrismaRoundToFirebaseMirror(makeRound());

  assert.equal(mirror.roundId, "round-1");
  assert.equal(mirror.round.prismaRoundId, "round-1");
  assert.equal(mirror.round.roundName, "July 18, 2026");
  assert.equal(mirror.round.roundDate, "2026-07-18T13:00:00.000Z");
  assert.equal(mirror.round.roundMode, "MATCH_QUOTA");
  assert.equal(mirror.round.scoringEntryMode, "QUICK");
  assert.equal(mirror.round.status, "setup");
  assert.equal(mirror.round.teamCount, 4);
  assert.equal(mirror.round.notes, "Saturday round");
  assert.equal(mirror.round.source, "prisma");
  assert.equal(mirror.round.migrationPhase, 3);
  assert.equal(mirror.round.createdByUid, null);
  assert.equal(mirror.round.updatedByUid, null);
  assert.match(mirror.round.checksum, /^[a-f0-9]{64}$/);
  assert.equal(mirror.activePointer.roundId, "round-1");
  assert.equal(mirror.activePointer.status, "setup");
});

test("maps active, locked, canceled, and posted round statuses", () => {
  assert.equal(mapPrismaRoundToFirebaseMirror(makeRound({ startedAt: UPDATED_AT })).round.status, "active");
  assert.equal(mapPrismaRoundToFirebaseMirror(makeRound({ lockedAt: UPDATED_AT })).round.status, "locked");
  assert.equal(mapPrismaRoundToFirebaseMirror(makeRound({ canceledAt: UPDATED_AT })).round.status, "canceled");
  assert.equal(mapPrismaRoundToFirebaseMirror(makeRound({ completedAt: UPDATED_AT })).round.status, "posted");
});

test("status precedence is canceled, posted, locked, active, setup", () => {
  assert.equal(
    mapPrismaRoundStatus({
      canceledAt: UPDATED_AT,
      completedAt: UPDATED_AT,
      lockedAt: UPDATED_AT,
      startedAt: UPDATED_AT
    }),
    "canceled"
  );
  assert.equal(
    mapPrismaRoundStatus({
      canceledAt: null,
      completedAt: UPDATED_AT,
      lockedAt: UPDATED_AT,
      startedAt: UPDATED_AT
    }),
    "posted"
  );
  assert.equal(
    mapPrismaRoundStatus({
      canceledAt: null,
      completedAt: null,
      lockedAt: UPDATED_AT,
      startedAt: UPDATED_AT
    }),
    "locked"
  );
});

test("normalizes QUICK and DETAILED scoring entry modes", () => {
  assert.equal(mapPrismaRoundToFirebaseMirror(makeRound({ scoringEntryMode: "QUICK" })).round.scoringEntryMode, "QUICK");
  assert.equal(mapPrismaRoundToFirebaseMirror(makeRound({ scoringEntryMode: "DETAILED" })).round.scoringEntryMode, "DETAILED");
});

test("normalizes MATCH_QUOTA and SKINS_ONLY round modes", () => {
  assert.equal(mapPrismaRoundToFirebaseMirror(makeRound({ roundMode: "MATCH_QUOTA" })).round.roundMode, "MATCH_QUOTA");
  assert.equal(
    mapPrismaRoundToFirebaseMirror(makeRound({ roundMode: "SKINS_ONLY", teamCount: null, entries: [makeEntry({ team: null })] })).round.roundMode,
    "SKINS_ONLY"
  );
});

test("maps entries with separate start quota and operational current quota", () => {
  const mirror = mapPrismaRoundToFirebaseMirror(makeRound());
  const entry = mirror.entries.find((candidate) => candidate.prismaPlayerId === "player-1");

  assert.ok(entry);
  assert.equal(entry.prismaEntryId, "entry-1");
  assert.equal(entry.playerName, "Gary Neupauer");
  assert.equal(entry.normalizedName, "gary neupauer");
  assert.equal(entry.startQuota, 18);
  assert.equal(entry.currentQuota, 16);
  assert.equal(entry.team, "A");
  assert.equal(entry.groupNumber, 1);
  assert.equal(entry.teeTime, "9:00 AM");
  assert.equal(entry.isActive, true);
  assert.equal(entry.isRegular, true);
  assert.match(entry.checksum, /^[a-f0-9]{64}$/);
});

test("uses operational current quota fallback without changing start quota", () => {
  const mirror = mapPrismaRoundToFirebaseMirror(
    makeRound({
      entries: [
        makeEntry({
          player: {
            id: "player-1",
            name: "Gary Neupauer",
            quota: 21,
            currentQuota: null,
            startingQuota: 20,
            isActive: true,
            isRegular: true
          },
          startQuota: 18
        })
      ]
    })
  );

  assert.equal(mirror.entries[0].startQuota, 18);
  assert.equal(mirror.entries[0].currentQuota, 21);
});

test("sorts entries deterministically and assigns sortOrder", () => {
  const mirror = mapPrismaRoundToFirebaseMirror(
    makeRound({
      entries: [
        makeEntry({ id: "entry-3", playerId: "player-3", playerName: "Zed Player", player: undefined, startQuota: 10, team: "C", groupNumber: 2 }),
        makeEntry({ id: "entry-2", playerId: "player-2", playerName: "Amy Player", player: undefined, startQuota: 11, team: "B", groupNumber: 1 }),
        makeEntry({ id: "entry-1", playerId: "player-1", playerName: "Gary Player", player: undefined, startQuota: 12, team: "A", groupNumber: 1 })
      ]
    })
  );

  assert.deepEqual(
    mirror.entries.map((entry) => [entry.prismaPlayerId, entry.sortOrder]),
    [
      ["player-1", 1],
      ["player-2", 2],
      ["player-3", 3]
    ]
  );
});

test("checksums are deterministic for identical Prisma data", () => {
  const left = mapPrismaRoundToFirebaseMirror(makeRound());
  const right = mapPrismaRoundToFirebaseMirror(makeRound());

  assert.deepEqual(left, right);
});

test("checksums change after meaningful setup changes", () => {
  const base = mapPrismaRoundToFirebaseMirror(makeRound());

  assert.notEqual(mapPrismaRoundToFirebaseMirror(makeRound({ roundName: "Different" })).round.checksum, base.round.checksum);
  assert.notEqual(mapPrismaRoundToFirebaseMirror(makeRound({ startedAt: UPDATED_AT })).round.checksum, base.round.checksum);
  assert.notEqual(
    mapPrismaRoundToFirebaseMirror(
      makeRound({ entries: [makeEntry({ team: "C" })] })
    ).entries[0].checksum,
    mapPrismaRoundToFirebaseMirror(makeRound({ entries: [makeEntry()] })).entries[0].checksum
  );
});

test("score fields are excluded and rejected from setup mirror input", () => {
  const mirror = mapPrismaRoundToFirebaseMirror(makeRound());
  assert.equal("hole1" in mirror.entries[0], false);
  assert.equal("quickFrontNine" in mirror.entries[0], false);
  assert.throws(
    () =>
      mapPrismaRoundToFirebaseMirror(
        makeRound({
          entries: [
            {
              ...makeEntry(),
              hole1: 1
            } as unknown as PrismaRoundMirrorInput["entries"][number]
          ]
        })
      ),
    /must not include score field hole1/
  );
});

test("rejects duplicate player IDs, malformed teams, groups, missing IDs, and invalid quotas", () => {
  assert.throws(() => mapPrismaRoundToFirebaseMirror(makeRound({ id: "" })), /Prisma round ID is required/);
  assert.throws(
    () => mapPrismaRoundToFirebaseMirror(makeRound({ entries: [makeEntry(), makeEntry({ id: "entry-2" })] })),
    /Duplicate round entry player ID/
  );
  assert.throws(() => mapPrismaRoundToFirebaseMirror(makeRound({ entries: [makeEntry({ team: "Z" })] })), /Team must be/);
  assert.throws(() => mapPrismaRoundToFirebaseMirror(makeRound({ entries: [makeEntry({ groupNumber: 0 })] })), /Group number/);
  assert.throws(() => mapPrismaRoundToFirebaseMirror(makeRound({ entries: [makeEntry({ startQuota: Number.NaN })] })), /start quota/i);
});

test("audit classifies round, entries, and active pointer as created, updated, unchanged, and extra", () => {
  const expected = mapPrismaRoundToFirebaseMirror(makeRound());
  const result = auditFirebaseRoundMirror(expected, {
    round: { prismaRoundId: expected.round.prismaRoundId, checksum: "changed" },
    entries: [
      { prismaPlayerId: "player-1", checksum: expected.entries.find((entry) => entry.prismaPlayerId === "player-1")?.checksum },
      { prismaPlayerId: "player-2", checksum: "changed" },
      { prismaPlayerId: "extra-player", checksum: "extra" }
    ],
    activePointer: null
  });

  assert.deepEqual(result.round.counts, { created: 0, updated: 1, unchanged: 0, extra: 0 });
  assert.deepEqual(result.entries.counts, { created: 0, updated: 1, unchanged: 1, extra: 1 });
  assert.deepEqual(result.activePointer.counts, { created: 1, updated: 0, unchanged: 0, extra: 0 });
  assert.deepEqual(result.entries.updatedIds, ["player-2"]);
  assert.deepEqual(result.entries.extraIds, ["extra-player"]);
});

test("audit reports created round and extra existing round when round IDs differ", () => {
  const expected = mapPrismaRoundToFirebaseMirror(makeRound());
  const result = auditFirebaseRoundMirror(expected, {
    round: { prismaRoundId: "old-round", checksum: "old" },
    entries: [],
    activePointer: { roundId: "old-round", prismaRoundId: "old-round", checksum: "old" }
  });

  assert.deepEqual(result.round.counts, { created: 1, updated: 0, unchanged: 0, extra: 1 });
  assert.deepEqual(result.round.extraIds, ["old-round"]);
  assert.deepEqual(result.activePointer.counts, { created: 0, updated: 1, unchanged: 0, extra: 0 });
  assert.deepEqual(result.activePointer.updatedIds, ["round-1"]);
  assert.deepEqual(result.activePointer.extraIds, []);
});

test("audit treats prior valid active pointer as rollover update without extra", () => {
  const expected = mapPrismaRoundToFirebaseMirror(makeRound());
  const result = auditFirebaseRoundMirror(expected, {
    round: null,
    entries: [],
    activePointer: {
      roundId: "prior-round",
      prismaRoundId: "prior-round",
      checksum: "prior-pointer-checksum"
    }
  });

  assert.deepEqual(result.round.counts, { created: 1, updated: 0, unchanged: 0, extra: 0 });
  assert.deepEqual(result.entries.counts, { created: 2, updated: 0, unchanged: 0, extra: 0 });
  assert.deepEqual(result.activePointer.counts, { created: 0, updated: 1, unchanged: 0, extra: 0 });
  assert.deepEqual(result.activePointer.updatedIds, ["round-1"]);
  assert.deepEqual(result.activePointer.extraIds, []);
});

test("audit is idempotent and does not mutate inputs", () => {
  const expected = mapPrismaRoundToFirebaseMirror(makeRound());
  const firestore = {
    round: { prismaRoundId: expected.round.prismaRoundId, checksum: expected.round.checksum },
    entries: expected.entries.map((entry) => ({ prismaPlayerId: entry.prismaPlayerId, checksum: entry.checksum })),
    activePointer: {
      roundId: expected.activePointer.roundId,
      prismaRoundId: expected.activePointer.prismaRoundId,
      checksum: expected.activePointer.checksum
    }
  };
  const expectedSnapshot = structuredClone(expected);
  const firestoreSnapshot = structuredClone(firestore);

  const first = auditFirebaseRoundMirror(expected, firestore);
  const second = auditFirebaseRoundMirror(expected, firestore);

  assert.deepEqual(first, second);
  assert.deepEqual(expected, expectedSnapshot);
  assert.deepEqual(firestore, firestoreSnapshot);
  assert.deepEqual(first.round.counts, { created: 0, updated: 0, unchanged: 1, extra: 0 });
  assert.deepEqual(first.entries.counts, { created: 0, updated: 0, unchanged: 2, extra: 0 });
  assert.deepEqual(first.activePointer.counts, { created: 0, updated: 0, unchanged: 1, extra: 0 });
});
