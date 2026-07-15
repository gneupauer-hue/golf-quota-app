import test from "node:test";
import assert from "node:assert/strict";
import { assertGranularRetryOperation } from "@/lib/firebase/granular-ops";

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
