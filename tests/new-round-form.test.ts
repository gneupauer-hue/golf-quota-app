import test from "node:test";
import assert from "node:assert/strict";
import { buildCreateRoundRequestBody } from "@/components/new-round-form";

test("default create request is a normal Match + Quota round", () => {
  assert.deepEqual(buildCreateRoundRequestBody("MATCH_QUOTA", false), {
    roundMode: "MATCH_QUOTA",
    scoringEntryMode: "QUICK",
    isTestRound: false
  });
});

test("enabled Test Round toggle sends isTestRound true", () => {
  assert.deepEqual(buildCreateRoundRequestBody("MATCH_QUOTA", true), {
    roundMode: "MATCH_QUOTA",
    scoringEntryMode: "QUICK",
    isTestRound: true
  });
});

test("disabled Test Round toggle does not accidentally create a test round", () => {
  const body = buildCreateRoundRequestBody("SKINS_ONLY", false);

  assert.equal(body.isTestRound, false);
});

test("existing game modes still use the selected round mode", () => {
  assert.equal(buildCreateRoundRequestBody("MATCH_QUOTA", false).roundMode, "MATCH_QUOTA");
  assert.equal(buildCreateRoundRequestBody("SKINS_ONLY", false).roundMode, "SKINS_ONLY");
});

test("create request remains setup-only and does not include score fields", () => {
  const bodyText = JSON.stringify(buildCreateRoundRequestBody("MATCH_QUOTA", true));

  for (const blocked of ["hole1", "quickFrontNine", "quickBackNine", "skins", "payout"]) {
    assert.equal(bodyText.includes(blocked), false, `${blocked} should not be part of round creation`);
  }
});
