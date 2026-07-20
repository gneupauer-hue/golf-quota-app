import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getQuickEntryMissingScoreMessage } from "@/components/quick-entry-round-view";

const QUICK_ENTRY_SOURCE = readFileSync("components/quick-entry-round-view.tsx", "utf8");

test("quick-entry save explains when both Front and Back are blank", () => {
  assert.equal(
    getQuickEntryMissingScoreMessage({
      quickFrontNine: null,
      quickBackNine: null
    }),
    "Enter Front and Back scores, including 0."
  );
});

test("quick-entry save explains when Front is blank", () => {
  assert.equal(
    getQuickEntryMissingScoreMessage({
      quickFrontNine: null,
      quickBackNine: 0
    }),
    "Enter a Front score, including 0."
  );
});

test("quick-entry save explains when Back is blank", () => {
  assert.equal(
    getQuickEntryMissingScoreMessage({
      quickFrontNine: 0,
      quickBackNine: null
    }),
    "Enter a Back score, including 0."
  );
});

test("quick-entry accepts explicit zero scores as valid values", () => {
  assert.equal(
    getQuickEntryMissingScoreMessage({
      quickFrontNine: 0,
      quickBackNine: 0
    }),
    null
  );
});

test("quick-entry missing score feedback is shown beneath the player scorecard", () => {
  const scoreMessageIndex = QUICK_ENTRY_SOURCE.indexOf("scoreValidationMessage ? (");
  const skinMessageIndex = QUICK_ENTRY_SOURCE.indexOf("skinValidationMessage ? (");
  const goodSkinsIndex = QUICK_ENTRY_SOURCE.indexOf("row.goodSkinEntries.length ?");

  assert.notEqual(scoreMessageIndex, -1);
  assert.ok(scoreMessageIndex < skinMessageIndex);
  assert.ok(scoreMessageIndex < goodSkinsIndex);
});

test("quick-entry Save remains tappable so blank fields can show feedback", () => {
  assert.notEqual(QUICK_ENTRY_SOURCE.indexOf("disabled={isArchiving}"), -1);
  assert.equal(QUICK_ENTRY_SOURCE.includes("disabled={isArchiving || missingScore}"), false);
});

test("quick-entry clears missing score feedback after valid values are entered or saved", () => {
  assert.notEqual(QUICK_ENTRY_SOURCE.indexOf("function handleFrontNineChange"), -1);
  assert.notEqual(QUICK_ENTRY_SOURCE.indexOf("function handleBackNineChange"), -1);
  assert.notEqual(QUICK_ENTRY_SOURCE.indexOf("[confirmedId]: null"), -1);
});

