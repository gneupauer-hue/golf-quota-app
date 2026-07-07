import test from "node:test";
import assert from "node:assert/strict";
import { mergeScoreEntryPatch } from "@/lib/round-service";

function emptyHoles() {
  return Array.from({ length: 18 }, () => null as number | null);
}

function applyPatch(
  state: Map<string, Array<number | null>>,
  playerId: string,
  patch: Parameters<typeof mergeScoreEntryPatch>[1]
) {
  const merged = mergeScoreEntryPatch(
    {
      holes: state.get(playerId) ?? emptyHoles(),
      quickFrontNine: null,
      quickBackNine: null,
      birdieHolesCsv: "",
      frontSubmittedAt: null,
      backSubmittedAt: null
    },
    patch
  );

  state.set(playerId, merged.holes);
}

test("two phones saving different groups do not overwrite each other", () => {
  const state = new Map<string, Array<number | null>>([
    ["group-1-player", emptyHoles()],
    ["group-2-player", emptyHoles()]
  ]);

  applyPatch(state, "group-1-player", {
    holeScores: [{ holeNumber: 1, score: 2 }]
  });
  applyPatch(state, "group-2-player", {
    holeScores: [{ holeNumber: 1, score: 4 }]
  });

  assert.equal(state.get("group-1-player")?.[0], 2);
  assert.equal(state.get("group-2-player")?.[0], 4);
});

test("stale same-player partial hole saves preserve newer untouched holes", () => {
  const state = new Map<string, Array<number | null>>([["player-1", emptyHoles()]]);

  applyPatch(state, "player-1", {
    holeScores: [{ holeNumber: 1, score: 2 }]
  });
  applyPatch(state, "player-1", {
    holeScores: [{ holeNumber: 2, score: 4 }]
  });

  assert.deepEqual(state.get("player-1")?.slice(0, 3), [2, 4, null]);
});

test("locked submitted scores still require unlock before editing", () => {
  const submittedAt = new Date("2026-07-07T12:00:00.000Z");

  assert.throws(
    () =>
      mergeScoreEntryPatch(
        {
          holes: [2, ...Array.from({ length: 17 }, () => null as number | null)],
          quickFrontNine: null,
          quickBackNine: null,
          birdieHolesCsv: "",
          frontSubmittedAt: submittedAt,
          backSubmittedAt: null
        },
        {
          holeScores: [{ holeNumber: 1, score: 4 }]
        }
      ),
    /Submitted scores are locked/
  );
});
