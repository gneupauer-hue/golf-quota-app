import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isRegularRoundScoreMirrorCapabilityEnabled } from "@/lib/firebase/score-mirror-rollout";

const SERVER_SOURCE = readFileSync("lib/firebase/score-mirror-rollout-server.ts", "utf8");

test("regular-round score mirror capability requires the private flag to be exact lowercase true", () => {
  const privateFlag = "FIREBASE_REGULAR_ROUND_SCORE_MIRROR_ENABLED";

  for (const value of [undefined, "", "false", "TRUE"]) {
    assert.equal(
      isRegularRoundScoreMirrorCapabilityEnabled({ [privateFlag]: value }),
      false
    );
  }

  assert.equal(
    isRegularRoundScoreMirrorCapabilityEnabled({ [privateFlag]: "true" }),
    true
  );
});

test("server wrapper returns only the boolean capability", () => {
  assert.match(SERVER_SOURCE, /import "server-only"/);
  assert.match(SERVER_SOURCE, /isRegularRoundScoreMirrorCapabilityEnabled\(process\.env\)/);
  assert.equal(SERVER_SOURCE.includes("return process.env"), false);
});
