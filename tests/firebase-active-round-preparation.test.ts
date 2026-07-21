import test from "node:test";
import assert from "node:assert/strict";
import {
  didRoundTransitionDraftToLive,
  prepareActiveRoundFirestoreMirror,
  type ActiveRoundPreparationAdapters
} from "@/lib/firebase/active-round-preparation";
import { isActiveRoundAutoPreparationEnabled } from "@/lib/firebase/active-round-preparation-rollout";
import type { PrismaRoundMirrorInput } from "@/lib/firebase/round-mirror";
import type { PrismaScoreMirrorEntryInput, PrismaScoreMirrorRoundInput } from "@/lib/firebase/score-mirror";

const CREATED_AT = new Date("2026-07-18T12:00:00.000Z");

function makeRound(overrides: Partial<PrismaRoundMirrorInput> = {}): PrismaRoundMirrorInput {
  return {
    id: "round-1",
    roundName: "Round",
    roundDate: CREATED_AT,
    roundMode: "MATCH_QUOTA",
    scoringEntryMode: "QUICK",
    isTestRound: false,
    teamCount: 2,
    notes: null,
    createdAt: CREATED_AT,
    lockedAt: CREATED_AT,
    startedAt: CREATED_AT,
    entries: [
      {
        id: "entry-1",
        playerId: "player-1",
        player: {
          id: "player-1",
          name: "Gary Neupauer",
          quota: 10,
          currentQuota: 10,
          startingQuota: 10,
          isActive: true,
          isRegular: true
        },
        startQuota: 10,
        team: "A",
        groupNumber: 1,
        teeTime: "9:00 AM"
      }
    ],
    ...overrides
  };
}

function makeScoreRound(overrides: Partial<PrismaScoreMirrorRoundInput> = {}): PrismaScoreMirrorRoundInput {
  const entry: PrismaScoreMirrorEntryInput = {
    id: "entry-1",
    playerId: "player-1",
    playerName: "Gary Neupauer",
    quickFrontNine: null,
    quickBackNine: null,
    frontSubmittedAt: null,
    backSubmittedAt: null,
    birdieHolesCsv: "",
    hole1: null,
    hole2: null,
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
    hole18: null
  };

  return {
    id: "round-1",
    roundMode: "MATCH_QUOTA",
    scoringEntryMode: "QUICK",
    entries: [entry],
    ...overrides
  };
}

function makeAdapters(overrides: Partial<ActiveRoundPreparationAdapters> = {}): ActiveRoundPreparationAdapters {
  return {
    readActivePrismaRoundSetup: async () => makeRound(),
    readActivePrismaRoundScores: async () => makeScoreRound(),
    readFirestoreRound: async () => null,
    readFirestoreRoundEntries: async () => [],
    readFirestoreActivePointer: async () => null,
    readFirestoreScores: async () => [],
    acquirePreparationLock: async () => async () => undefined,
    writePreparationBatch: async (_clubId, _roundId, input) =>
      (input.round ? 1 : 0) +
      input.entries.length +
      (input.activePointer ? 1 : 0) +
      input.scoresToCreate.length +
      1,
    createOperationId: () => "operation-1",
    ...overrides
  };
}

test("auto-preparation flag requires exact lowercase true", () => {
  for (const value of [undefined, "", "false", "TRUE", " true "]) {
    assert.equal(
      isActiveRoundAutoPreparationEnabled({ FIREBASE_ACTIVE_ROUND_AUTO_PREP_ENABLED: value }),
      false
    );
  }
  assert.equal(
    isActiveRoundAutoPreparationEnabled({ FIREBASE_ACTIVE_ROUND_AUTO_PREP_ENABLED: "true" }),
    true
  );
});

test("draft-to-live detection only fires for draft to started or locked", () => {
  assert.equal(didRoundTransitionDraftToLive({ lockedAt: null, startedAt: null }, { lockedAt: CREATED_AT }), true);
  assert.equal(didRoundTransitionDraftToLive({ lockedAt: null, startedAt: null }, { startedAt: CREATED_AT }), true);
  assert.equal(didRoundTransitionDraftToLive({ lockedAt: CREATED_AT, startedAt: null }, { lockedAt: CREATED_AT }), false);
  assert.equal(didRoundTransitionDraftToLive({ lockedAt: null, startedAt: null }, { lockedAt: null, startedAt: null }), false);
});

test("preparation creates shell, entries, pointer, missing baseline score, and readiness", async () => {
  const writes: unknown[] = [];
  const result = await prepareActiveRoundFirestoreMirror({
    clubId: "club-1",
    expectedPrismaRoundId: "round-1",
    mode: "auto",
    adapters: makeAdapters({
      writePreparationBatch: async (_clubId, _roundId, input) => {
        writes.push(input);
        return 5;
      }
    })
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "ready");
  assert.equal(result.round?.counts.created, 1);
  assert.equal(result.entries?.counts.created, 1);
  assert.equal(result.activePointer?.counts.created, 1);
  assert.equal(result.scores?.counts.created, 1);
  assert.equal(result.writesApplied, 5);
  assert.equal(writes.length, 1);
});

test("a stale/partial active-round pointer does NOT block preparation (it is overwritten)", async () => {
  // Regression: a leftover pointer from a previous round (here missing
  // prismaRoundId and checksum) used to throw malformed-pointer and abort,
  // which forced a manual publish on every new round. It must now just be
  // rewritten to the current round.
  const writes: Array<{ activePointer?: unknown }> = [];
  const result = await prepareActiveRoundFirestoreMirror({
    clubId: "club-1",
    expectedPrismaRoundId: "round-1",
    mode: "auto",
    adapters: makeAdapters({
      readFirestoreActivePointer: async () => ({
        roundId: "old-round",
        prismaRoundId: undefined,
        checksum: ""
      }),
      writePreparationBatch: async (_clubId, _roundId, input) => {
        writes.push(input);
        return 5;
      }
    })
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "ready");
  assert.equal(result.activePointer?.counts.updated, 1);
  assert.equal(writes.length, 1);
  assert.ok(writes[0].activePointer, "the corrected pointer should be written");
});

test("existing valid score documents are preserved and not overwritten", async () => {
  let scoreWrites = 0;
  const baseline = (await import("@/lib/firebase/score-mirror")).mapPrismaScoresToFirebaseMirror(makeScoreRound()).scores[0];
  const result = await prepareActiveRoundFirestoreMirror({
    clubId: "club-1",
    expectedPrismaRoundId: "round-1",
    mode: "auto",
    adapters: makeAdapters({
      readFirestoreScores: async () => [
        {
          docId: baseline.prismaPlayerId,
          prismaRoundId: baseline.prismaRoundId,
          prismaEntryId: baseline.prismaEntryId,
          prismaPlayerId: baseline.prismaPlayerId,
          checksum: baseline.checksum,
          source: "firestore-test",
          scoreVersion: 6,
          lastOperationId: "op-1"
        }
      ],
      writePreparationBatch: async (_clubId, _roundId, input) => {
        scoreWrites = input.scoresToCreate.length;
        return 4;
      }
    })
  });

  assert.equal(result.ok, true);
  assert.equal(result.scores?.counts.unchanged, 1);
  assert.equal(scoreWrites, 0);
});

test("extra score documents block preparation", async () => {
  const readinessWrites: unknown[] = [];
  const result = await prepareActiveRoundFirestoreMirror({
    clubId: "club-1",
    expectedPrismaRoundId: "round-1",
    mode: "repair",
    adapters: makeAdapters({
      readFirestoreScores: async () => [
        {
          docId: "extra-player",
          prismaRoundId: "round-1",
          prismaEntryId: "entry-extra",
          prismaPlayerId: "extra-player",
          checksum: "abc",
          source: "prisma",
          scoreVersion: 1
        }
      ],
      writeReadiness: async (_clubId, readiness) => {
        readinessWrites.push(readiness);
      }
    })
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "extra-score");
  assert.equal(result.writesApplied, 0);
  assert.deepEqual(readinessWrites, [
    {
      roundId: "round-1",
      status: "repair-needed",
      errorCode: "extra-score",
      preparedBy: "server",
      operationId: "operation-1"
    }
  ]);
});

test("active lock returns preparing without marking repair needed", async () => {
  const result = await prepareActiveRoundFirestoreMirror({
    clubId: "club-1",
    expectedPrismaRoundId: "round-1",
    mode: "auto",
    adapters: makeAdapters({
      acquirePreparationLock: async () => "preparing"
    })
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "preparing");
  assert.equal(result.errorCode, "lock-active");
});

test("batch failure reports zero writes applied", async () => {
  const result = await prepareActiveRoundFirestoreMirror({
    clubId: "club-1",
    expectedPrismaRoundId: "round-1",
    mode: "auto",
    adapters: makeAdapters({
      writePreparationBatch: async () => {
        throw new Error("boom");
      }
    })
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "batch-failed");
  assert.equal(result.writesApplied, 0);
});
