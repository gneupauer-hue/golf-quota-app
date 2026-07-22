import test from "node:test";
import assert from "node:assert/strict";
import { calculateAdjustedQuota, calculateTeeAdjustment } from "@/lib/tees";

// Regression: on 2026-07-22 a whole field that moved up one set of tees could not
// post the round. The "Confirm Quota Changes" guard checked
//   startQuota + quotaAdjustment === nextQuota
// but startQuota includes the tee adjustment while quotaAdjustment is measured
// from the BASE quota, so every tee mover was falsely flagged
// ("Quota approval blocked. Check: ..."). The fix carries baseQuota to the guard
// and checks baseQuota + quotaAdjustment === nextQuota.

// Mirror how the server builds a preview row for one player.
function buildPreviewRow(baseQuota: number, defaultTee: "GREEN", playingTee: "WHITE", nextQuota: number) {
  const startQuota = calculateAdjustedQuota(baseQuota, defaultTee, playingTee); // base + tee adj
  return {
    baseQuota,
    startQuota,
    nextQuota,
    // server: quotaAdjustment = nextQuota - baseQuota
    quotaAdjustment: nextQuota - baseQuota
  };
}

// The corrected guard predicate.
function isBlocked(row: { baseQuota?: number; startQuota: number; quotaAdjustment: number; nextQuota: number }) {
  return (row.baseQuota ?? row.startQuota) + row.quotaAdjustment !== row.nextQuota;
}

test("a player who moved up a set of tees is NOT blocked from posting", () => {
  // base 28, moved GREEN -> WHITE (two sets forward = +4 here), permanent -1.
  const row = buildPreviewRow(28, "GREEN", "WHITE", 27);
  assert.equal(calculateTeeAdjustment("GREEN", "WHITE"), 4); // sanity: tee math is nonzero
  assert.equal(row.startQuota, 32); // 28 + 4
  assert.equal(isBlocked(row), false, "tee mover must be postable");
});

test("the OLD startQuota-based check would have wrongly blocked the tee mover", () => {
  const row = buildPreviewRow(28, "GREEN", "WHITE", 27);
  const oldBlocked = row.startQuota + row.quotaAdjustment !== row.nextQuota;
  assert.equal(oldBlocked, true, "documents the bug the fix removes");
});

test("a player on their normal tees is unaffected", () => {
  const row = { baseQuota: 24, startQuota: 24, quotaAdjustment: -1, nextQuota: 23 };
  assert.equal(isBlocked(row), false);
});

test("a genuinely inconsistent row is still caught", () => {
  const row = { baseQuota: 24, startQuota: 24, quotaAdjustment: -1, nextQuota: 99 };
  assert.equal(isBlocked(row), true);
});
