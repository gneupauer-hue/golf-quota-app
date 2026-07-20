import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getScoreMirrorCollectionPath,
  normalizeScoreMirrorDocument,
  normalizeScoreMirrorSnapshot,
  subscribeToScoreMirrorCollection
} from "@/lib/firebase/score-listener";

const LISTENER_SOURCE = readFileSync("lib/firebase/score-listener.ts", "utf8");
const PILOT_SOURCE = readFileSync("components/score-mirror-listener-pilot.tsx", "utf8");
const ROUND_EDITOR_SOURCE = readFileSync("components/round-editor.tsx", "utf8");
const ROUND_PAGE_SOURCE = readFileSync("app/rounds/[id]/page.tsx", "utf8");

function makeHoles(overrides: Record<string, number | null> = {}) {
  return Object.fromEntries(
    Array.from({ length: 18 }, (_, index) => {
      const key = String(index + 1);
      return [key, overrides[key] ?? null];
    })
  );
}

function makeScoreData(overrides: Record<string, unknown> = {}) {
  return {
    prismaRoundId: "round-1",
    prismaEntryId: "entry-1",
    prismaPlayerId: "player-1",
    scoringEntryMode: "QUICK",
    roundMode: "MATCH_QUOTA",
    holes: makeHoles({ "1": 1 }),
    quickFrontNine: 12,
    quickBackNine: null,
    frontSubmittedAt: "2026-07-18T17:00:00.000Z",
    backSubmittedAt: null,
    birdieHoles: [{ holeNumber: 3, type: "birdie", score: 4 }],
    source: "prisma",
    scoreVersion: 1,
    checksum: "abc123",
    ...overrides
  };
}

test("listener uses the exact Firestore score collection path", () => {
  assert.equal(
    getScoreMirrorCollectionPath("club-1", "round-1"),
    "clubs/club-1/rounds/round-1/scores"
  );
});

test("listener returns the Firebase unsubscribe function and normalizes snapshots", () => {
  const unsubscribe = () => {};
  const collectionCalls: string[][] = [];
  let receivedCount = 0;
  let receivedMalformedCount = 0;

  const result = subscribeToScoreMirrorCollection({
    clubId: "club-1",
    roundId: "round-1",
    db: {} as never,
    makeCollection: (_db, ...pathSegments) => {
      collectionCalls.push(pathSegments);
      return { pathSegments };
    },
    onSnapshotFn: (_collectionRef, onNext) => {
      onNext({
        docs: [
          { id: "player-1", data: () => makeScoreData() },
          { id: "bad-player", data: () => makeScoreData({ prismaPlayerId: "other-player" }) }
        ]
      });
      return unsubscribe;
    },
    onNext: (snapshot) => {
      receivedCount = snapshot.scores.length;
      receivedMalformedCount = snapshot.malformed.length;
    },
    onError: () => {
      throw new Error("Unexpected listener error.");
    }
  });

  assert.equal(result, unsubscribe);
  assert.deepEqual(collectionCalls, [["clubs", "club-1", "rounds", "round-1", "scores"]]);
  assert.equal(receivedCount, 1);
  assert.equal(receivedMalformedCount, 1);
});

test("valid score mirror documents normalize without calculating derived scoring data", () => {
  const normalized = normalizeScoreMirrorDocument({ id: "player-1", data: () => makeScoreData() });

  assert.equal(normalized.malformedReason, null);
  assert.equal(normalized.score?.prismaPlayerId, "player-1");
  assert.equal(normalized.score?.holes["1"], 1);
  assert.equal(normalized.score?.quickFrontNine, 12);
  assert.equal("totalPoints" in (normalized.score as Record<string, unknown>), false);
  assert.equal("rank" in (normalized.score as Record<string, unknown>), false);
});

test("mismatched document ID and malformed fields are flagged without crashing", () => {
  assert.match(
    normalizeScoreMirrorDocument({
      id: "doc-id",
      data: () => makeScoreData({ prismaPlayerId: "player-id" })
    }).malformedReason ?? "",
    /Document ID/
  );
  assert.match(
    normalizeScoreMirrorDocument({
      id: "player-1",
      data: () => makeScoreData({ holes: makeHoles({ "7": 3 }) })
    }).malformedReason ?? "",
    /hole 7/
  );
  assert.match(
    normalizeScoreMirrorDocument({
      id: "player-1",
      data: () => makeScoreData({ birdieHoles: [{ holeNumber: 19, type: "birdie", score: 4 }] })
    }).malformedReason ?? "",
    /birdieHoles/
  );
});

test("empty score mirror collection is a valid connected snapshot", () => {
  const snapshot = normalizeScoreMirrorSnapshot([]);

  assert.equal(snapshot.scores.length, 0);
  assert.equal(snapshot.malformed.length, 0);
});

test("listener and pilot do not import Firestore write APIs", () => {
  for (const source of [LISTENER_SOURCE, PILOT_SOURCE]) {
    assert.equal(/\b(setDoc|updateDoc|addDoc|deleteDoc|writeBatch|runTransaction)\b/.test(source), false);
  }
});

test("round editor mounts the pilot without changing Prisma score save paths", () => {
  assert.notEqual(ROUND_EDITOR_SOURCE.indexOf("ScoreMirrorListenerPilot"), -1);
  assert.notEqual(ROUND_EDITOR_SOURCE.indexOf("/api/rounds/${round.id}/score-entry"), -1);
  assert.equal(ROUND_EDITOR_SOURCE.includes("/api/firebase/score-mirror/publish"), false);
});

test("round editor score-write pilot is server-routed and gated by test or server-resolved regular capability", () => {
  assert.notEqual(ROUND_EDITOR_SOURCE.indexOf("/api/firebase/score-write"), -1);
  assert.notEqual(ROUND_EDITOR_SOURCE.indexOf("regularRoundScoreMirrorEnabled"), -1);
  assert.equal(ROUND_EDITOR_SOURCE.includes("process.env.NEXT_PUBLIC_FIREBASE_REGULAR_ROUND_SCORE_MIRROR_ENABLED"), false);
  assert.notEqual(ROUND_PAGE_SOURCE.indexOf("getRegularRoundScoreMirrorCapability"), -1);
  assert.notEqual(ROUND_PAGE_SOURCE.indexOf("regularRoundScoreMirrorEnabled"), -1);
  assert.notEqual(ROUND_EDITOR_SOURCE.indexOf("shouldAttemptFirestoreScoreMirror"), -1);
  assert.ok(
    ROUND_EDITOR_SOURCE.indexOf("/api/rounds/${round.id}/score-entry") <
      ROUND_EDITOR_SOURCE.indexOf("await writeFirestoreTestScoreOperations(nextRows, options);")
  );
  assert.notEqual(ROUND_EDITOR_SOURCE.indexOf("buildFirestoreTestScoreOperations(nextRows, options.previousRows ?? [], options)"), -1);
  assert.equal(ROUND_EDITOR_SOURCE.includes("buildFirestoreTestScoreOperations(nextRows, savedRows, options)"), false);
  assert.notEqual(ROUND_EDITOR_SOURCE.indexOf("canSeeFirestoreTestWriteDiagnostic"), -1);
  assert.equal(/\b(setDoc|updateDoc|addDoc|deleteDoc|writeBatch|runTransaction)\b/.test(ROUND_EDITOR_SOURCE), false);
});

test("round editor owner diagnostics show test status and server-resolved regular rollout capability", () => {
  assert.notEqual(ROUND_EDITOR_SOURCE.indexOf("canSeeFirestoreTestWriteDiagnostic"), -1);
  assert.notEqual(ROUND_EDITOR_SOURCE.indexOf("activeFirebaseMembership.role === \"owner\""), -1);
  assert.notEqual(ROUND_EDITOR_SOURCE.indexOf("activeFirebaseMembership.role === \"admin\""), -1);
  assert.notEqual(ROUND_EDITOR_SOURCE.indexOf("Test Mirror"), -1);
  assert.notEqual(ROUND_EDITOR_SOURCE.indexOf("Regular Rollout"), -1);
  assert.notEqual(
    ROUND_EDITOR_SOURCE.indexOf(
      'regularRoundScoreMirrorEnabled ? "Enabled" : "Disabled"'
    ),
    -1
  );
  assert.equal(
    ROUND_EDITOR_SOURCE.includes(
      '!isTestRound && canUseFirestoreTestScoreWrite ? "Enabled" : "Disabled"'
    ),
    false
  );
});

test("round editor player score save captures previous rows and uses granular PATCH before Firestore writes", () => {
  const snapshotIndex = ROUND_EDITOR_SOURCE.indexOf("const previousRowsForSave = cloneFirestoreTestScoreOperationRows(savedRows);");
  const rowsForSaveIndex = ROUND_EDITOR_SOURCE.indexOf("const rowsForSave = isQuickEntryMode && playerId");
  const patchIndex = ROUND_EDITOR_SOURCE.indexOf("fetch(`/api/rounds/${round.id}/score-entry`");
  const putIndex = ROUND_EDITOR_SOURCE.indexOf("fetch(`/api/rounds/${round.id}`");
  const playerPersistIndex = ROUND_EDITOR_SOURCE.indexOf("await persistScoreEntries(rowsToSave, {");
  const previousRowsOptionIndex = ROUND_EDITOR_SOURCE.indexOf("previousRows: previousRowsForSave", playerPersistIndex);
  const firestoreWriteIndex = ROUND_EDITOR_SOURCE.indexOf("await writeFirestoreTestScoreOperations(nextRows, options);");

  assert.ok(snapshotIndex >= 0);
  assert.ok(rowsForSaveIndex > snapshotIndex);
  assert.ok(patchIndex >= 0);
  assert.ok(putIndex >= 0);
  assert.ok(patchIndex > putIndex);
  assert.ok(playerPersistIndex >= 0);
  assert.ok(previousRowsOptionIndex > playerPersistIndex);
  assert.ok(firestoreWriteIndex > patchIndex);
});

test("round editor reports zero Firestore operations without claiming a write", () => {
  assert.notEqual(ROUND_EDITOR_SOURCE.indexOf("No Firestore mirror operation was needed."), -1);
  assert.ok(
    ROUND_EDITOR_SOURCE.indexOf("No Firestore mirror operation was needed.") <
      ROUND_EDITOR_SOURCE.indexOf("Firestore mirror write saved.")
  );
});

test("round editor retries a score mirror conflict only once with the same client request ID", () => {
  const clientRequestIdIndex = ROUND_EDITOR_SOURCE.indexOf("const clientRequestId =");
  const firstSendIndex = ROUND_EDITOR_SOURCE.indexOf("let { response, result } = await sendRequest();");
  const retryIndex = ROUND_EDITOR_SOURCE.indexOf("await sendRequest(result.currentScoreVersion)");

  assert.ok(clientRequestIdIndex >= 0);
  assert.ok(firstSendIndex > clientRequestIdIndex);
  assert.ok(retryIndex > firstSendIndex);
  assert.equal(
    ROUND_EDITOR_SOURCE.includes("sendRequest(result.currentScoreVersion +"),
    false
  );
  assert.equal(
    ROUND_EDITOR_SOURCE.includes("buildFirestoreTestScoreOperations(rows"),
    false
  );
});
