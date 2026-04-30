import test from "node:test";
import assert from "node:assert/strict";
import { shouldSkipQuotaProgression } from "@/lib/round-service";

test("test rounds never affect quota progression", () => {
  assert.equal(
    shouldSkipQuotaProgression({ roundMode: "MATCH_QUOTA", isTestRound: true }),
    true
  );
});

test("individual quota plus skins rounds affect quota progression", () => {
  assert.equal(
    shouldSkipQuotaProgression({ roundMode: "SKINS_ONLY", isTestRound: false }),
    false
  );
});

test("normal match rounds still affect quota progression", () => {
  assert.equal(
    shouldSkipQuotaProgression({ roundMode: "MATCH_QUOTA", isTestRound: false }),
    false
  );
});
