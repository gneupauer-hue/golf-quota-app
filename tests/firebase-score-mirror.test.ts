import test from "node:test";
import assert from "node:assert/strict";
import {
  auditFirebaseScoreMirror,
  buildScoreMirrorChecksumInput,
  mapPrismaScoresToFirebaseMirror,
  type PrismaScoreMirrorEntryInput,
  type PrismaScoreMirrorRoundInput
} from "@/lib/firebase/score-mirror";

function makeEntry(overrides: Partial<PrismaScoreMirrorEntryInput> = {}): PrismaScoreMirrorEntryInput {
  return {
    id: "entry-1",
    playerId: "player-1",
    playerName: "Gary Neupauer",
    hole1: 1,
    hole2: 2,
    hole3: null,
    hole4: null,
    hole5: null,
    hole6: null,
    hole7: null,
    hole8: null,
    hole9: null,
    hole10: null,
    hole11: null,
    hole12: null,
    hole13: null,
    hole14: null,
    hole15: null,
    hole16: null,
    hole17: null,
    hole18: null,
    quickFrontNine: 17,
    quickBackNine: null,
    frontSubmittedAt: "2026-07-18T17:00:00.000Z",
    backSubmittedAt: null,
    birdieHolesCsv: "7:eagle,2:birdie,7:birdie",
    ...overrides
  };
}

function makeRound(overrides: Partial<PrismaScoreMirrorRoundInput> = {}): PrismaScoreMirrorRoundInput {
  return {
    id: "round-1",
    roundMode: "MATCH_QUOTA",
    scoringEntryMode: "QUICK",
    entries: [
      makeEntry(),
      makeEntry({
        id: "entry-2",
        playerId: "player-2",
        playerName: "Joe Rubbico",
        quickFrontNine: null,
        quickBackNine: 14,
        frontSubmittedAt: null,
        backSubmittedAt: new Date("2026-07-18T19:00:00.000Z"),
        birdieHolesCsv: ""
      })
    ],
    ...overrides
  };
}

test("maps Prisma score state to the Firestore score mirror shape", () => {
  const result = mapPrismaScoresToFirebaseMirror(makeRound());
  const score = result.scores.find((candidate) => candidate.prismaPlayerId === "player-1");

  assert.ok(score);
  assert.equal(result.roundId, "round-1");
  assert.equal(score.prismaRoundId, "round-1");
  assert.equal(score.prismaEntryId, "entry-1");
  assert.equal(score.prismaPlayerId, "player-1");
  assert.equal(score.scoringEntryMode, "QUICK");
  assert.equal(score.roundMode, "MATCH_QUOTA");
  assert.equal(score.holes["1"], 1);
  assert.equal(score.holes["2"], 2);
  assert.equal(score.holes["3"], null);
  assert.equal(score.quickFrontNine, 17);
  assert.equal(score.quickBackNine, null);
  assert.equal(score.frontSubmittedAt, "2026-07-18T17:00:00.000Z");
  assert.equal(score.backSubmittedAt, null);
  assert.equal(score.source, "prisma");
  assert.equal(score.scoreVersion, 1);
  assert.match(score.checksum, /^[a-f0-9]{64}$/);
});

test("preserves null holes and maps all 18 hole keys", () => {
  const score = mapPrismaScoresToFirebaseMirror(makeRound({ entries: [makeEntry()] })).scores[0];

  assert.deepEqual(Object.keys(score.holes), [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
    "16",
    "17",
    "18"
  ]);
  assert.equal(score.holes["18"], null);
});

test("keeps quick score and mode fields distinct for match quota and skins-only rounds", () => {
  const matchQuota = mapPrismaScoresToFirebaseMirror(makeRound({ roundMode: "MATCH_QUOTA", scoringEntryMode: "QUICK" })).scores[0];
  const skinsOnly = mapPrismaScoresToFirebaseMirror(makeRound({ roundMode: "SKINS_ONLY", scoringEntryMode: "DETAILED" })).scores[0];

  assert.equal(matchQuota.roundMode, "MATCH_QUOTA");
  assert.equal(matchQuota.scoringEntryMode, "QUICK");
  assert.equal(skinsOnly.roundMode, "SKINS_ONLY");
  assert.equal(skinsOnly.scoringEntryMode, "DETAILED");
});

test("normalizes birdie holes as deterministic good-skin score input", () => {
  const score = mapPrismaScoresToFirebaseMirror(makeRound({ entries: [makeEntry()] })).scores[0];

  assert.deepEqual(score.birdieHoles, [
    { holeNumber: 2, type: "birdie", score: 4 },
    { holeNumber: 7, type: "eagle", score: 6 }
  ]);
});

test("checksum excludes derived result fields and changes for meaningful score changes", () => {
  const base = mapPrismaScoresToFirebaseMirror(makeRound({ entries: [makeEntry()] })).scores[0];

  assert.deepEqual(Object.keys(buildScoreMirrorChecksumInput(base)).sort(), [
    "backSubmittedAt",
    "birdieHoles",
    "frontSubmittedAt",
    "holes",
    "prismaEntryId",
    "prismaPlayerId",
    "prismaRoundId",
    "quickBackNine",
    "quickFrontNine",
    "roundMode",
    "scoreVersion",
    "scoringEntryMode",
    "source"
  ]);
  assert.notEqual(
    mapPrismaScoresToFirebaseMirror(makeRound({ entries: [makeEntry({ hole1: 2 })] })).scores[0].checksum,
    base.checksum
  );
  assert.notEqual(
    mapPrismaScoresToFirebaseMirror(makeRound({ entries: [makeEntry({ quickFrontNine: 18 })] })).scores[0].checksum,
    base.checksum
  );
  assert.notEqual(
    mapPrismaScoresToFirebaseMirror(makeRound({ entries: [makeEntry({ birdieHolesCsv: "3:ace" })] })).scores[0].checksum,
    base.checksum
  );
  assert.notEqual(
    mapPrismaScoresToFirebaseMirror(makeRound({ entries: [makeEntry({ frontSubmittedAt: "2026-07-18T17:01:00.000Z" })] })).scores[0].checksum,
    base.checksum
  );
});

test("rejects invalid modes, duplicate players, invalid holes, invalid quick values, bad timestamps, and derived fields", () => {
  assert.throws(() => mapPrismaScoresToFirebaseMirror(makeRound({ roundMode: "OTHER" })), /Round mode/);
  assert.throws(() => mapPrismaScoresToFirebaseMirror(makeRound({ scoringEntryMode: "OTHER" })), /Scoring entry mode/);
  assert.throws(
    () => mapPrismaScoresToFirebaseMirror(makeRound({ entries: [makeEntry(), makeEntry({ id: "entry-2" })] })),
    /Duplicate score entry player ID/
  );
  assert.throws(() => mapPrismaScoresToFirebaseMirror(makeRound({ entries: [makeEntry({ hole1: 3 })] })), /Hole 1/);
  assert.throws(() => mapPrismaScoresToFirebaseMirror(makeRound({ entries: [makeEntry({ quickFrontNine: 55 })] })), /Front nine/);
  assert.throws(() => mapPrismaScoresToFirebaseMirror(makeRound({ entries: [makeEntry({ frontSubmittedAt: "bad-date" })] })), /Front submission/);
  assert.throws(
    () =>
      mapPrismaScoresToFirebaseMirror(
        makeRound({ entries: [{ ...makeEntry(), totalPoints: 30 } as unknown as PrismaScoreMirrorEntryInput] })
      ),
    /derived result field totalPoints/
  );
});

test("audit result is idempotent and does not mutate inputs", () => {
  const expected = mapPrismaScoresToFirebaseMirror(makeRound());
  const firestore = [{ prismaPlayerId: "player-1", checksum: expected.scores[0].checksum }];
  const expectedSnapshot = structuredClone(expected);
  const firestoreSnapshot = structuredClone(firestore);

  const first = auditFirebaseScoreMirror(expected, firestore);
  const second = auditFirebaseScoreMirror(expected, firestore);

  assert.deepEqual(first, second);
  assert.deepEqual(expected, expectedSnapshot);
  assert.deepEqual(firestore, firestoreSnapshot);
});

test("audit classifies created, updated, unchanged, and extra score mirrors with player names", () => {
  const expected = mapPrismaScoresToFirebaseMirror(makeRound());
  const playerOne = expected.scores.find((score) => score.prismaPlayerId === "player-1");
  const result = auditFirebaseScoreMirror(expected, [
    { prismaPlayerId: "player-1", checksum: playerOne?.checksum },
    { prismaPlayerId: "player-2", checksum: "different" },
    { prismaPlayerId: "extra-player", checksum: "extra", playerName: "Extra Player" }
  ]);

  assert.deepEqual(result.counts, {
    created: 0,
    updated: 1,
    unchanged: 1,
    extra: 1
  });
  assert.deepEqual(result.updated, [{ playerId: "player-2", playerName: "Joe Rubbico" }]);
  assert.deepEqual(result.unchanged, [{ playerId: "player-1", playerName: "Gary Neupauer" }]);
  assert.deepEqual(result.extra, [{ playerId: "extra-player", playerName: "Extra Player" }]);
});
