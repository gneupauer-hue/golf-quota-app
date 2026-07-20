import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildFirestoreTestScoreOperations,
  cloneFirestoreTestScoreOperationRows,
  isRegularRoundScoreMirrorClientEnabled,
  shouldAttemptFirestoreScoreMirror,
  type FirestoreTestScoreOperationRow
} from "@/lib/firebase/score-write-operations";

function makeRow(overrides: Partial<FirestoreTestScoreOperationRow> = {}): FirestoreTestScoreOperationRow {
  return {
    playerId: "player-1",
    holeScores: Array.from({ length: 18 }, () => null),
    quickFrontNine: 0,
    quickBackNine: 0,
    birdieHolesText: "",
    ...overrides
  };
}

test("client rollout flag source uses a static public environment reference", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "lib/firebase/score-write-operations.ts"), "utf8");

  assert.match(
    source,
    /process\.env\.NEXT_PUBLIC_FIREBASE_REGULAR_ROUND_SCORE_MIRROR_ENABLED/
  );
});

test("changing only quick front sends exactly one set-quick-front request", () => {
  const saved = makeRow();
  const next = makeRow({ quickFrontNine: 1 });

  assert.deepEqual(buildFirestoreTestScoreOperations([next], [saved], { includeAllHoles: true }), [
    {
      playerId: "player-1",
      operation: { type: "set-quick-front", value: 1 }
    }
  ]);
});

test("unchanged quick back and unchanged birdie holes send no requests", () => {
  const saved = makeRow({ quickFrontNine: 1, quickBackNine: 0, birdieHolesText: "" });
  const next = makeRow({ quickFrontNine: 1, quickBackNine: 0, birdieHolesText: "" });

  assert.deepEqual(buildFirestoreTestScoreOperations([next], [saved], { includeAllHoles: true }), []);
});

test("ordinary quick Save sends no automatic submit operations", () => {
  const saved = makeRow();
  const next = makeRow({ quickFrontNine: 1 });
  const operations = buildFirestoreTestScoreOperations([next], [saved], { includeAllHoles: true });
  const operationTypes = operations.map((item) => item.operation.type as string);

  assert.equal(operationTypes.includes("submit-front"), false);
  assert.equal(operationTypes.includes("submit-back"), false);
});

test("changing front and back sends exactly two operations", () => {
  const saved = makeRow();
  const next = makeRow({ quickFrontNine: 1, quickBackNine: 2 });

  assert.deepEqual(buildFirestoreTestScoreOperations([next], [saved], { includeAllHoles: true }), [
    {
      playerId: "player-1",
      operation: { type: "set-quick-front", value: 1 }
    },
    {
      playerId: "player-1",
      operation: { type: "set-quick-back", value: 2 }
    }
  ]);
});

test("changing birdies only sends exactly one normalized birdie operation", () => {
  const saved = makeRow({ quickFrontNine: 1, quickBackNine: 2, birdieHolesText: "" });
  const next = makeRow({ quickFrontNine: 1, quickBackNine: 2, birdieHolesText: "3:birdie" });

  assert.deepEqual(buildFirestoreTestScoreOperations([next], [saved], { includeAllHoles: true }), [
    {
      playerId: "player-1",
      operation: {
        type: "set-birdie-holes",
        value: [{ holeNumber: 3, type: "birdie", score: 4 }]
      }
    }
  ]);
});

test("detailed hole saves only send changed hole operations", () => {
  const savedHoles: Array<number | null> = Array.from({ length: 18 }, () => null);
  const nextHoles = [...savedHoles];
  nextHoles[6] = 4;

  assert.deepEqual(
    buildFirestoreTestScoreOperations(
      [makeRow({ holeScores: nextHoles })],
      [makeRow({ holeScores: savedHoles })],
      { holeIndexes: [6, 7] }
    ),
    [
      {
        playerId: "player-1",
        operation: { type: "set-hole", holeNumber: 7, value: 4 }
      }
    ]
  );
});

test("captured previous snapshots are not changed by later row mutations", () => {
  const saved = makeRow({
    quickFrontNine: 0,
    quickBackNine: 0,
    holeScores: Array.from({ length: 18 }, () => null)
  });
  const capturedPreviousRows = cloneFirestoreTestScoreOperationRows([saved]);
  saved.quickFrontNine = 1;
  saved.holeScores[0] = 5;

  assert.deepEqual(
    buildFirestoreTestScoreOperations(
      [makeRow({ quickFrontNine: 1, quickBackNine: 0 })],
      capturedPreviousRows,
      { includeAllHoles: true }
    ),
    [
      {
        playerId: "player-1",
        operation: { type: "set-quick-front", value: 1 }
      }
    ]
  );
  assert.equal(capturedPreviousRows[0].quickFrontNine, 0);
  assert.equal(capturedPreviousRows[0].holeScores[0], null);
});

test("regular-round client rollout flag defaults to false unless explicitly true", () => {
  assert.equal(isRegularRoundScoreMirrorClientEnabled(undefined), false);
  assert.equal(isRegularRoundScoreMirrorClientEnabled(""), false);
  assert.equal(isRegularRoundScoreMirrorClientEnabled("false"), false);
  assert.equal(isRegularRoundScoreMirrorClientEnabled("TRUE"), false);
  assert.equal(isRegularRoundScoreMirrorClientEnabled("true"), true);
});

test("client attempts regular-round mirroring only when the public flag is enabled", () => {
  const base = {
    isRoundOpenForScoring: true,
    signedIn: true,
    activeClubId: "club-1",
    activeMembershipStatus: "active"
  };

  assert.equal(
    shouldAttemptFirestoreScoreMirror({
      ...base,
      isTestRound: true,
      regularRoundClientEnabled: false
    }),
    true
  );
  assert.equal(
    shouldAttemptFirestoreScoreMirror({
      ...base,
      isTestRound: false,
      regularRoundClientEnabled: false
    }),
    false
  );
  assert.equal(
    shouldAttemptFirestoreScoreMirror({
      ...base,
      isTestRound: false,
      regularRoundClientEnabled: true
    }),
    true
  );
  assert.equal(
    shouldAttemptFirestoreScoreMirror({
      ...base,
      isTestRound: false,
      activeMembershipStatus: "removed",
      regularRoundClientEnabled: true
    }),
    false
  );
});
