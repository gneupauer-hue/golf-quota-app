import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEditedPlayerQuotaFields,
  buildNewPlayerQuotaFields,
  resolvePlayerBaselineQuota
} from "@/lib/player-quota-state";
import { validatePlayerQuotaHistory } from "@/lib/quota-history";

test("new player quota fields are synchronized from the created quota", () => {
  assert.deepEqual(buildNewPlayerQuotaFields(34), {
    quota: 34,
    currentQuota: 34,
    startingQuota: 34
  });
});

test("dormant player quota edits update quota, currentQuota, and startingQuota", () => {
  assert.deepEqual(buildEditedPlayerQuotaFields(35, 0), {
    quota: 35,
    currentQuota: 35,
    startingQuota: 35
  });
});

test("dormant Players page quota rebuild uses the editable saved quota", () => {
  const baselineQuota = resolvePlayerBaselineQuota({
    name: "Joe Weiscarger",
    quota: 35,
    currentQuota: 35,
    startingQuota: 34,
    _count: { roundEntries: 0 }
  });
  const validation = validatePlayerQuotaHistory({
    playerId: "joe-weiscarger",
    playerName: "Joe Weiscarger",
    baselineQuota,
    currentQuota: 35,
    rounds: []
  });

  assert.equal(validation.rebuilt.currentQuota, 35);
  assert.equal(validation.issues.length, 0);
});

test("players with finalized rounds keep historical quota behavior", () => {
  const updateData = buildEditedPlayerQuotaFields(35, 1);
  const baselineQuota = resolvePlayerBaselineQuota({
    name: "Joe Bevavino",
    quota: 35,
    currentQuota: 35,
    startingQuota: 99,
    _count: { roundEntries: 1 }
  });

  assert.equal("startingQuota" in updateData, false);
  assert.equal(baselineQuota, 34);
});
