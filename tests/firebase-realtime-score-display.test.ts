import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addRecentLocalOperationId,
  reconcileRealtimeQuickScoreDisplay,
  type RealtimeScoreDisplayMirror,
  type RealtimeScoreDisplayRow
} from "@/lib/firebase/realtime-score-display";
import { isRealtimeScoreDisplayEnabled } from "@/lib/firebase/realtime-score-display-rollout";

const ROUND_EDITOR_SOURCE = readFileSync("components/round-editor.tsx", "utf8");
const ROUND_PAGE_SOURCE = readFileSync("app/rounds/[id]/page.tsx", "utf8");
const SERVER_SOURCE = readFileSync("lib/firebase/realtime-score-display-server.ts", "utf8");

function row(overrides: Partial<RealtimeScoreDisplayRow> = {}): RealtimeScoreDisplayRow {
  return {
    playerId: "player-1",
    quickFrontNine: 1,
    quickBackNine: 0,
    birdieHolesText: "",
    ...overrides
  };
}

function holes() {
  return Object.fromEntries(Array.from({ length: 18 }, (_, index) => [String(index + 1), null])) as RealtimeScoreDisplayMirror["holes"];
}

function score(overrides: Partial<RealtimeScoreDisplayMirror> = {}): RealtimeScoreDisplayMirror {
  return {
    prismaRoundId: "round-1",
    prismaEntryId: "entry-1",
    prismaPlayerId: "player-1",
    scoringEntryMode: "QUICK",
    roundMode: "MATCH_QUOTA",
    holes: holes(),
    quickFrontNine: 2,
    quickBackNine: 0,
    frontSubmittedAt: "2026-07-20T10:00:00.000Z",
    backSubmittedAt: "2026-07-20T10:00:00.000Z",
    birdieHoles: [],
    source: "firestore-test",
    scoreVersion: 2,
    checksum: "checksum",
    ...overrides
  };
}

test("realtime score display flag requires exact lowercase true", () => {
  for (const value of [undefined, "", "false", "TRUE"]) {
    assert.equal(isRealtimeScoreDisplayEnabled({ FIREBASE_REALTIME_SCORE_DISPLAY_ENABLED: value }), false);
  }

  assert.equal(isRealtimeScoreDisplayEnabled({ FIREBASE_REALTIME_SCORE_DISPLAY_ENABLED: "true" }), true);
});

test("server wrapper resolves only a boolean capability without exposing raw env values", () => {
  assert.match(SERVER_SOURCE, /import "server-only"/);
  assert.match(SERVER_SOURCE, /isRealtimeScoreDisplayEnabled\(process\.env\)/);
  assert.equal(SERVER_SOURCE.includes("return process.env"), false);
  assert.match(ROUND_PAGE_SOURCE, /getRealtimeScoreDisplayCapability/);
  assert.match(ROUND_PAGE_SOURCE, /realtimeScoreDisplayEnabled/);
});

test("initial snapshot establishes baseline versions without overwriting Prisma rows", () => {
  const originalRows = [row({ quickFrontNine: 1 })];
  const result = reconcileRealtimeQuickScoreDisplay({
    rows: originalRows,
    scores: [score({ quickFrontNine: 9, scoreVersion: 7 })],
    state: { baselineVersions: {}, initialized: false }
  });

  assert.equal(result.rows, originalRows);
  assert.equal(result.rows[0].quickFrontNine, 1);
  assert.deepEqual(result.state, { baselineVersions: { "player-1": 7 }, initialized: true });
  assert.deepEqual(result.updatedPlayerIds, []);
});

test("newer quick-front and quick-back values apply to a clean player", () => {
  const first = reconcileRealtimeQuickScoreDisplay({
    rows: [row()],
    scores: [score({ scoreVersion: 1 })],
    state: { baselineVersions: {}, initialized: false }
  });
  const second = reconcileRealtimeQuickScoreDisplay({
    rows: first.rows,
    scores: [score({ quickFrontNine: 3, quickBackNine: 4, scoreVersion: 2 })],
    state: first.state
  });

  assert.equal(second.rows[0].quickFrontNine, 3);
  assert.equal(second.rows[0].quickBackNine, 4);
  assert.deepEqual(second.updatedPlayerIds, ["player-1"]);
});

test("newer birdie data applies safely while submission fields are ignored", () => {
  const first = reconcileRealtimeQuickScoreDisplay({
    rows: [row()],
    scores: [score({ scoreVersion: 1 })],
    state: { baselineVersions: {}, initialized: false }
  });
  const second = reconcileRealtimeQuickScoreDisplay({
    rows: first.rows,
    scores: [
      score({
        quickFrontNine: 1,
        quickBackNine: 0,
        birdieHoles: [{ holeNumber: 6, type: "birdie", score: 4 }],
        frontSubmittedAt: "2099-01-01T00:00:00.000Z",
        backSubmittedAt: "2099-01-01T00:00:00.000Z",
        scoreVersion: 2
      })
    ],
    state: first.state
  });

  assert.equal(second.rows[0].birdieHolesText, "6:birdie");
  assert.equal("frontSubmittedAt" in second.rows[0], false);
  assert.equal("backSubmittedAt" in second.rows[0], false);
});

test("stale and equal versions are ignored", () => {
  const baseState = { baselineVersions: { "player-1": 3 }, initialized: true };

  for (const scoreVersion of [2, 3]) {
    const result = reconcileRealtimeQuickScoreDisplay({
      rows: [row({ quickFrontNine: 1 })],
      scores: [score({ quickFrontNine: 8, scoreVersion })],
      state: baseState
    });
    assert.equal(result.rows[0].quickFrontNine, 1);
    assert.deepEqual(result.updatedPlayerIds, []);
  }
});

test("dirty and saving players are not overwritten and remote conflicts are reported only for dirty rows", () => {
  const dirty = reconcileRealtimeQuickScoreDisplay({
    rows: [row({ quickFrontNine: 1 })],
    scores: [score({ quickFrontNine: 8, scoreVersion: 4, lastOperationId: "remote-op" })],
    state: { baselineVersions: { "player-1": 3 }, initialized: true },
    dirtyPlayerIds: ["player-1"]
  });
  const saving = reconcileRealtimeQuickScoreDisplay({
    rows: [row({ quickFrontNine: 1 })],
    scores: [score({ quickFrontNine: 8, scoreVersion: 4, lastOperationId: "remote-op" })],
    state: { baselineVersions: { "player-1": 3 }, initialized: true },
    savingPlayerIds: ["player-1"]
  });

  assert.equal(dirty.rows[0].quickFrontNine, 1);
  assert.deepEqual(dirty.conflictPlayerIds, ["player-1"]);
  assert.equal(saving.rows[0].quickFrontNine, 1);
  assert.deepEqual(saving.conflictPlayerIds, []);
});

test("same-account updates from another phone are treated as remote without a matching operation ID", () => {
  const result = reconcileRealtimeQuickScoreDisplay({
    rows: [row({ quickFrontNine: 1 })],
    scores: [
      score({
        quickFrontNine: 2,
        scoreVersion: 4,
        lastEditedByUid: "uid-1",
        lastOperationId: "other-phone-op"
      })
    ],
    state: { baselineVersions: { "player-1": 3 }, initialized: true },
    dirtyPlayerIds: ["player-1"],
    localOperationIds: ["this-phone-op"]
  });

  assert.equal(result.rows[0].quickFrontNine, 1);
  assert.deepEqual(result.conflictPlayerIds, ["player-1"]);
});

test("only a matching local operation ID is treated as an echo", () => {
  const result = reconcileRealtimeQuickScoreDisplay({
    rows: [row({ quickFrontNine: 1 })],
    scores: [score({ quickFrontNine: 2, scoreVersion: 4, lastOperationId: "this-phone-op" })],
    state: { baselineVersions: { "player-1": 3 }, initialized: true },
    savingPlayerIds: ["player-1"],
    localOperationIds: ["this-phone-op"]
  });

  assert.equal(result.rows[0].quickFrontNine, 1);
  assert.deepEqual(result.conflictPlayerIds, []);
});

test("recent local operation tracking is bounded and deduplicated", () => {
  let operationIds: string[] = [];
  for (let index = 1; index <= 14; index += 1) {
    operationIds = addRecentLocalOperationId(operationIds, `op-${index}`);
  }
  operationIds = addRecentLocalOperationId(operationIds, "op-10");

  assert.equal(operationIds.length, 12);
  assert.equal(operationIds[0], "op-10");
  assert.equal(new Set(operationIds).size, operationIds.length);
  assert.equal(operationIds.includes("op-1"), false);
});

test("first appearance of an initially missing document is baselined without applying", () => {
  const result = reconcileRealtimeQuickScoreDisplay({
    rows: [row({ quickFrontNine: 1 })],
    scores: [score({ quickFrontNine: 7, scoreVersion: 5 })],
    state: { baselineVersions: {}, initialized: true }
  });

  assert.equal(result.rows[0].quickFrontNine, 1);
  assert.equal(result.state.baselineVersions["player-1"], 5);
  assert.deepEqual(result.updatedPlayerIds, []);
});

test("sequential newer versions apply while stale out-of-order snapshots are ignored", () => {
  const first = reconcileRealtimeQuickScoreDisplay({
    rows: [row({ quickFrontNine: 1 })],
    scores: [score({ quickFrontNine: 2, scoreVersion: 2 })],
    state: { baselineVersions: { "player-1": 1 }, initialized: true }
  });
  const second = reconcileRealtimeQuickScoreDisplay({
    rows: first.rows,
    scores: [score({ quickFrontNine: 3, scoreVersion: 3 })],
    state: first.state
  });
  const stale = reconcileRealtimeQuickScoreDisplay({
    rows: second.rows,
    scores: [score({ quickFrontNine: 9, scoreVersion: 2 })],
    state: second.state
  });

  assert.equal(first.rows[0].quickFrontNine, 2);
  assert.equal(second.rows[0].quickFrontNine, 3);
  assert.equal(stale.rows[0].quickFrontNine, 3);
});

test("disabled pilot preserves current behavior and listener updates do not call write APIs", () => {
  assert.match(ROUND_EDITOR_SOURCE, /realtimeScoreDisplayEnabled = false/);
  assert.match(ROUND_EDITOR_SOURCE, /if \(!realtimeScoreDisplayEnabled/);
  assert.match(ROUND_EDITOR_SOURCE, /onSnapshot=\{realtimeScoreDisplayEnabled \? handleRealtimeScoreSnapshot : undefined\}/);
  assert.equal(ROUND_EDITOR_SOURCE.includes("persistScoreEntries(result.rows"), false);
  assert.equal(ROUND_EDITOR_SOURCE.includes("writeFirestoreTestScoreOperations(result.rows"), false);
  assert.equal(ROUND_EDITOR_SOURCE.includes("process.env"), false);
});

test("round editor marks quick edits dirty and updates saved baseline only for reconciled rows", () => {
  assert.match(ROUND_EDITOR_SOURCE, /function markPlayerDirty\(playerId: string\)/);
  assert.match(ROUND_EDITOR_SOURCE, /function updateQuickFrontNine[\s\S]*?markPlayerDirty\(playerId\)/);
  assert.match(ROUND_EDITOR_SOURCE, /function updateQuickBackNine[\s\S]*?markPlayerDirty\(playerId\)/);
  assert.match(ROUND_EDITOR_SOURCE, /function updateQuickBirdieHoles[\s\S]*?markPlayerDirty\(playerId\)/);
  assert.match(ROUND_EDITOR_SOURCE, /const updatedRows = result\.rows\.filter\(\(row\) => result\.updatedPlayerIds\.includes\(row\.playerId\)\)/);
  assert.match(ROUND_EDITOR_SOURCE, /setSavedRows\(\(current\) => mergeSavedRowState\(current, updatedRows\)\)/);
});

test("round editor tracks local operation IDs instead of treating same UID as an echo", () => {
  assert.match(ROUND_EDITOR_SOURCE, /localScoreMirrorOperationIds/);
  assert.match(ROUND_EDITOR_SOURCE, /addRecentLocalOperationId/);
  assert.match(ROUND_EDITOR_SOURCE, /localOperationIds: localScoreMirrorOperationIds/);
  assert.equal(ROUND_EDITOR_SOURCE.includes("localUid:"), false);
});
