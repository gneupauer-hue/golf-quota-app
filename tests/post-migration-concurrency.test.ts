import test from "node:test";
import assert from "node:assert/strict";
import { mergeScoreEntryPatch, type ScoreEntryPatch } from "@/lib/round-service";
import {
  reconcileRealtimeQuickScoreDisplay,
  type RealtimeScoreDisplayMirror,
  type RealtimeScoreDisplayRow,
  type RealtimeScoreDisplayState
} from "@/lib/firebase/realtime-score-display";
import type { FirebaseScoreHoles, FirebaseScoreHoleNumber } from "@/lib/firebase/types";

// ---------------------------------------------------------------------------
// These tests exercise the REAL persistence-merge logic (lib/round-service
// `mergeScoreEntryPatch`, which the server applies inside a Prisma transaction
// in `applyScoreEntryPatches`) and the REAL client display reconcile logic
// (lib/firebase `reconcileRealtimeQuickScoreDisplay`). They never touch a
// database — production or otherwise. Two "clients" are modeled as two
// serialized transactions over a shared in-memory store: each save re-reads the
// current server state, then merges its own granular patch, exactly as the
// Prisma transaction does.
// ---------------------------------------------------------------------------

function emptyHoles() {
  return Array.from({ length: 18 }, () => null as number | null);
}

// Simulated authoritative server store: playerId -> committed hole scores.
type ServerStore = Map<string, Array<number | null>>;

// One serialized "transaction": read current committed holes for the player,
// merge the incoming granular patch, write the result back. This mirrors what
// applyScoreEntryPatches does per player inside a single Prisma transaction.
function commitSave(
  store: ServerStore,
  playerId: string,
  patch: Omit<ScoreEntryPatch, "playerId">
) {
  const merged = mergeScoreEntryPatch(
    {
      holes: store.get(playerId) ?? emptyHoles(),
      quickFrontNine: null,
      quickBackNine: null,
      birdieHolesCsv: "",
      frontSubmittedAt: null,
      backSubmittedAt: null
    },
    patch
  );
  store.set(playerId, merged.holes);
  return merged.holes;
}

// ---- CASE 1: two clients editing DIFFERENT holes both persist ----------------

test("CASE 1a: two clients edit different holes for the SAME player — both persist", () => {
  const store: ServerStore = new Map([["p1", emptyHoles()]]);

  // Client A reads baseline, saves hole 1. Client B read the SAME (stale)
  // baseline but only sends a granular hole-2 patch. Serialized commits: B's
  // granular patch merges against the store that already has A's hole 1.
  commitSave(store, "p1", { holeScores: [{ holeNumber: 1, score: 2 }] });
  commitSave(store, "p1", { holeScores: [{ holeNumber: 2, score: 4 }] });

  const holes = store.get("p1")!;
  assert.equal(holes[0], 2, "hole 1 from client A persists");
  assert.equal(holes[1], 4, "hole 2 from client B persists");
});

test("CASE 1b: two clients edit different players in the same round — both persist", () => {
  const store: ServerStore = new Map([
    ["p1", emptyHoles()],
    ["p2", emptyHoles()]
  ]);

  commitSave(store, "p1", { holeScores: [{ holeNumber: 1, score: 2 }] });
  commitSave(store, "p2", { holeScores: [{ holeNumber: 1, score: 6 }] });

  assert.equal(store.get("p1")![0], 2);
  assert.equal(store.get("p2")![0], 6);
});

// ---- CASE 2: two clients editing the SAME hole do not silently overwrite -----

test("CASE 2a: same hole, different players (the real foursome case) — both persist", () => {
  const store: ServerStore = new Map([
    ["p1", emptyHoles()],
    ["p2", emptyHoles()]
  ]);

  // Two phones both sitting on the same hole, entering different players.
  commitSave(store, "p1", { holeScores: [{ holeNumber: 1, score: 2 }] });
  commitSave(store, "p2", { holeScores: [{ holeNumber: 1, score: 4 }] });

  assert.equal(store.get("p1")![0], 2, "p1 hole not overwritten by p2 save");
  assert.equal(store.get("p2")![0], 4, "p2 hole not overwritten by p1 save");
});

test("CASE 2b: display reconcile flags a conflict instead of silently overwriting a local edit", () => {
  // A player the local user is actively editing (dirty, unsaved) receives a
  // remote update from another phone. The reconcile must NOT silently replace
  // the local edit — it flags the player as a conflict and leaves the row as-is.
  const initState: RealtimeScoreDisplayState = { baselineVersions: { p1: 1 }, initialized: true };
  const localRow: RealtimeScoreDisplayRow = {
    playerId: "p1",
    quickFrontNine: 30, // typed locally, not yet saved
    quickBackNine: null,
    birdieHolesText: ""
  };
  const remoteScore = buildMirror("p1", { scoreVersion: 2, quickFrontNine: 40, lastOperationId: "remote-op" });

  const result = reconcileRealtimeQuickScoreDisplay({
    rows: [localRow],
    scores: [remoteScore],
    state: initState,
    dirtyPlayerIds: ["p1"],
    localOperationIds: [] // the remote op is NOT one of ours
  });

  assert.ok(result.conflictPlayerIds.includes("p1"), "conflict surfaced");
  assert.equal(result.rows[0].quickFrontNine, 30, "local unsaved edit preserved, not overwritten");
});

test("CASE 2c (documented semantic): identical same-player same-hole save is last-write-wins with NO collateral loss", () => {
  // This documents the ONE case that is intentionally last-write-wins: two
  // clients writing the exact same cell for the same player. The later commit
  // wins, but no OTHER hole is lost. There is no per-cell optimistic lock.
  const store: ServerStore = new Map([["p1", emptyHoles()]]);
  commitSave(store, "p1", { holeScores: [{ holeNumber: 1, score: 1 }] }); // client A -> hole 1 = 1
  commitSave(store, "p1", { holeScores: [{ holeNumber: 2, score: 4 }] }); // unrelated hole 2 = 4
  commitSave(store, "p1", { holeScores: [{ holeNumber: 1, score: 6 }] }); // client B re-edits hole 1 = 6

  const holes = store.get("p1")!;
  assert.equal(holes[0], 6, "last write to the contested cell wins (by design)");
  assert.equal(holes[1], 4, "the unrelated hole is NOT lost");
});

// ---- CASE 3: disconnect + reconnect re-syncs without losing entries ----------

test("CASE 3a: entries saved before a disconnect survive the reconnect (server is authoritative)", () => {
  const store: ServerStore = new Map([["p1", emptyHoles()]]);

  // Before disconnect: client saves three holes (committed to the server).
  commitSave(store, "p1", { holeScores: [{ holeNumber: 1, score: 2 }] });
  commitSave(store, "p1", { holeScores: [{ holeNumber: 2, score: 4 }] });
  commitSave(store, "p1", { holeScores: [{ holeNumber: 3, score: 2 }] });

  // Disconnect, then reconnect: the client re-reads authoritative server state.
  const afterReconnect = store.get("p1")!;
  assert.deepEqual(afterReconnect.slice(0, 3), [2, 4, 2], "no saved entries lost across reconnect");
});

test("CASE 3b: on reconnect, the client's own echoed write is not flagged as a conflict", () => {
  // After reconnect the listener re-delivers the client's own last write. With
  // the local op id remembered, reconcile recognizes the echo and does not flag
  // a false conflict against the user's own in-progress edit.
  const initState: RealtimeScoreDisplayState = { baselineVersions: { p1: 1 }, initialized: true };
  const localRow: RealtimeScoreDisplayRow = {
    playerId: "p1",
    quickFrontNine: 30,
    quickBackNine: null,
    birdieHolesText: ""
  };
  const echo = buildMirror("p1", { scoreVersion: 2, quickFrontNine: 30, lastOperationId: "op-1" });

  const result = reconcileRealtimeQuickScoreDisplay({
    rows: [localRow],
    scores: [echo],
    state: initState,
    dirtyPlayerIds: ["p1"],
    localOperationIds: ["op-1"] // it's our own write coming back
  });

  assert.equal(result.conflictPlayerIds.length, 0, "own echo does not raise a conflict");
});

test("CASE 3c: a reconnect snapshot that omits an un-acked local player does not drop that player's edit", () => {
  // The server has not yet received p1's edit; the reconnect snapshot only
  // carries p2. p1's local row must remain intact.
  const initState: RealtimeScoreDisplayState = { baselineVersions: { p2: 1 }, initialized: true };
  const rows: RealtimeScoreDisplayRow[] = [
    { playerId: "p1", quickFrontNine: 33, quickBackNine: null, birdieHolesText: "" },
    { playerId: "p2", quickFrontNine: null, quickBackNine: null, birdieHolesText: "" }
  ];
  const result = reconcileRealtimeQuickScoreDisplay({
    rows,
    scores: [buildMirror("p2", { scoreVersion: 2, quickFrontNine: 40 })],
    state: initState,
    dirtyPlayerIds: ["p1"]
  });

  const p1 = result.rows.find((row) => row.playerId === "p1")!;
  assert.equal(p1.quickFrontNine, 33, "un-acked local edit for p1 not dropped");
});

// ---- CASE 4: score writes are granular, not full-round overwrites ------------

test("CASE 4a: a single-hole patch preserves every other hole", () => {
  const existing = [2, 4, 2, ...Array.from({ length: 15 }, () => null as number | null)];
  const merged = mergeScoreEntryPatch(
    {
      holes: existing,
      quickFrontNine: null,
      quickBackNine: null,
      birdieHolesCsv: "",
      frontSubmittedAt: null,
      backSubmittedAt: null
    },
    { holeScores: [{ holeNumber: 4, score: 6 }] }
  );

  assert.deepEqual(
    merged.holes.slice(0, 4),
    [2, 4, 2, 6],
    "only hole 4 changed; holes 1-3 preserved"
  );
});

test("CASE 4b: a granular patch does not require the full 18-hole array", () => {
  // The hole-by-hole client sends holeScores (one touched hole), never the full
  // holes[] array. Merging such a patch against existing data must not blank the
  // untouched holes.
  const existing = [2, 4, 2, 1, 0, ...Array.from({ length: 13 }, () => null as number | null)];
  const merged = mergeScoreEntryPatch(
    {
      holes: existing,
      quickFrontNine: null,
      quickBackNine: null,
      birdieHolesCsv: "",
      frontSubmittedAt: null,
      backSubmittedAt: null
    },
    { holeScores: [{ holeNumber: 6, score: 2 }] }
  );

  assert.deepEqual(merged.holes.slice(0, 6), [2, 4, 2, 1, 0, 2]);
  assert.equal(merged.holes[6], null, "hole 7 remains untouched");
});

// --- helpers ------------------------------------------------------------------

function emptyMirrorHoles(): FirebaseScoreHoles {
  const holes = {} as FirebaseScoreHoles;
  for (let n = 1; n <= 18; n += 1) {
    holes[String(n) as FirebaseScoreHoleNumber] = null;
  }
  return holes;
}

function buildMirror(
  playerId: string,
  overrides: Partial<RealtimeScoreDisplayMirror> & { scoreVersion: number }
): RealtimeScoreDisplayMirror {
  return {
    prismaRoundId: "round-test",
    prismaEntryId: `entry-${playerId}`,
    prismaPlayerId: playerId,
    scoringEntryMode: "QUICK",
    roundMode: "MATCH_QUOTA",
    holes: emptyMirrorHoles(),
    quickFrontNine: null,
    quickBackNine: null,
    frontSubmittedAt: null,
    backSubmittedAt: null,
    birdieHoles: [],
    source: "prisma",
    checksum: "test",
    lastEditedByUid: null,
    lastOperationId: null,
    ...overrides
  };
}
