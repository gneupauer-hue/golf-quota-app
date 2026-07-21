import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const ROUND_EDITOR_SOURCE = readFileSync("components/round-editor.tsx", "utf8");

test("round setup player selection does not retrigger the server-to-editor reset", () => {
  const quotaMapStart = ROUND_EDITOR_SOURCE.indexOf("const roundPlayerQuotasById = useMemo");
  const filteredPlayersStart = ROUND_EDITOR_SOURCE.indexOf("const filteredPlayers = useMemo", quotaMapStart);
  const quotaMapSource = ROUND_EDITOR_SOURCE.slice(quotaMapStart, filteredPlayersStart);

  assert.ok(quotaMapStart >= 0, "expected the persisted round quota map");
  assert.ok(filteredPlayersStart > quotaMapStart, "expected the player filter after the quota map");
  assert.doesNotMatch(quotaMapSource, /for \(const row of rows\)/);
  assert.doesNotMatch(quotaMapSource, /\[[\s\S]*\brows\b[\s\S]*\]/);

  const syncEffectStart = ROUND_EDITOR_SOURCE.indexOf("const nextRows = mapEditorEntriesToRows(round.entries)");
  const syncEffectEnd = ROUND_EDITOR_SOURCE.indexOf("useEffect(() => {", syncEffectStart);
  const syncEffectSource = ROUND_EDITOR_SOURCE.slice(syncEffectStart, syncEffectEnd);

  assert.ok(syncEffectStart >= 0, "expected the server-to-editor synchronization effect");
  assert.doesNotMatch(syncEffectSource, /\[[\s\S]*\brows\b[\s\S]*\]/);
});
