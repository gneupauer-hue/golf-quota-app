import test from "node:test";
import assert from "node:assert/strict";
import {
  assertFirebaseScoreGranularOperation,
  assertGranularRetryOperation
} from "@/lib/firebase/granular-ops";

test("future Firebase retries are constrained to one granular score operation", () => {
  assert.doesNotThrow(() =>
    assertGranularRetryOperation({
      type: "hole-score",
      clubId: "club-1",
      roundId: "round-1",
      entryId: "entry-1",
      playerId: "player-1",
      holeNumber: 7,
      score: 2
    })
  );
});

test("future Firebase retries reject invalid broad hole operations", () => {
  assert.throws(
    () =>
      assertGranularRetryOperation({
        type: "hole-score",
        clubId: "club-1",
        roundId: "round-1",
        entryId: "entry-1",
        playerId: "player-1",
        holeNumber: 19,
        score: 2
      }),
    /one hole number/
  );
});

test("Phase 4 score operations are constrained to one granular field", () => {
  assert.doesNotThrow(() =>
    assertFirebaseScoreGranularOperation({
      type: "set-hole",
      playerId: "player-1",
      holeNumber: 7,
      value: 2,
      expectedCurrentValue: null,
      expectedVersion: 1
    })
  );
  assert.doesNotThrow(() =>
    assertFirebaseScoreGranularOperation({
      type: "set-quick-front",
      playerId: "player-1",
      value: 18,
      expectedCurrentValue: 17
    })
  );
  assert.doesNotThrow(() =>
    assertFirebaseScoreGranularOperation({
      type: "set-birdie-holes",
      playerId: "player-1",
      value: [{ holeNumber: 4, type: "birdie", score: 4 }],
      expectedCurrentValue: []
    })
  );
  assert.doesNotThrow(() =>
    assertFirebaseScoreGranularOperation({
      type: "submit-back",
      playerId: "player-1",
      value: "2026-07-18T19:00:00.000Z",
      expectedCurrentValue: null
    })
  );
});

test("Phase 4 score operations reject broad or malformed operations", () => {
  assert.throws(
    () =>
      assertFirebaseScoreGranularOperation({
        type: "set-hole",
        playerId: "player-1",
        holeNumber: 19,
        value: 2,
        expectedCurrentValue: null
      }),
    /one hole number/
  );
  assert.throws(
    () =>
      assertFirebaseScoreGranularOperation({
        type: "set-quick-back",
        playerId: "player-1",
        value: 55,
        expectedCurrentValue: null
      }),
    /Quick score/
  );
  assert.throws(
    () =>
      assertFirebaseScoreGranularOperation({
        type: "submit-front",
        playerId: "player-1",
        value: "bad-date",
        expectedCurrentValue: null
      }),
    /ISO timestamp/
  );
});
