import test from "node:test";
import assert from "node:assert/strict";
import {
  applyScoreWriteOperation,
  assertOperationMatchesLatestPrismaScore,
  buildInitialScoreWriteDocument,
  handleScoreWriteRequest,
  isRegularRoundScoreMirrorServerEnabled,
  normalizeExistingScoreDocument,
  type FirestoreScoreWriteDocument,
  type ScoreWriteMembership,
  type ScoreWritePrismaRound,
  type ScoreWriteRouteAdapters
} from "@/lib/firebase/score-write-route";
import { IREM_FIREBASE_PROJECT_ID } from "@/lib/firebase/player-mirror-seed";
import {
  mapPrismaScoresToFirebaseMirror,
  type PrismaScoreMirrorEntryInput
} from "@/lib/firebase/score-mirror";

function makeEntry(overrides: Partial<PrismaScoreMirrorEntryInput> = {}): PrismaScoreMirrorEntryInput {
  return {
    id: "entry-1",
    playerId: "player-1",
    playerName: "Gary Neupauer",
    hole1: null,
    hole2: null,
    hole3: null,
    hole4: null,
    hole5: null,
    hole6: null,
    hole7: null,
    hole8: null,
    hole9: null,
    hole10: null,
    hole11: null,
    hole12: null,
    hole13: null,
    hole14: null,
    hole15: null,
    hole16: null,
    hole17: null,
    hole18: null,
    quickFrontNine: null,
    quickBackNine: null,
    frontSubmittedAt: null,
    backSubmittedAt: null,
    birdieHolesCsv: "",
    ...overrides
  };
}

function makeRound(overrides: Partial<ScoreWritePrismaRound> = {}): ScoreWritePrismaRound {
  return {
    id: "round-1",
    roundMode: "MATCH_QUOTA",
    scoringEntryMode: "QUICK",
    isTestRound: true,
    completedAt: null,
    canceledAt: null,
    isPayoutLocked: false,
    entries: [makeEntry()],
    ...overrides
  };
}

function makeRequest(body: Record<string, unknown> = {}, token = "valid-token") {
  return new Request("http://localhost/api/firebase/score-write", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      clubId: "club-1",
      expectedProjectId: IREM_FIREBASE_PROJECT_ID,
      expectedPrismaRoundId: "round-1",
      prismaPlayerId: "player-1",
      operation: { type: "set-hole", holeNumber: 1, value: 2 },
      ...body
    })
  });
}

function initialScore(round = makeRound()) {
  return buildInitialScoreWriteDocument(mapPrismaScoresToFirebaseMirror(round).scores[0]);
}

function makeAdapters(overrides: Partial<ScoreWriteRouteAdapters> = {}): ScoreWriteRouteAdapters {
  return {
    verifyIdToken: async (idToken) => {
      if (idToken !== "valid-token") {
        throw Object.assign(new Error("Invalid Firebase ID token."), { status: 401 });
      }
      return { uid: "uid-1" };
    },
    verifyClub: async (clubId) => ({ id: clubId }),
    readClubMembership: async () => ({ role: "member", status: "active" }),
    readActivePrismaRoundScores: async () => makeRound(),
    readFirestoreRoundShell: async () => ({
      prismaRoundId: "round-1",
      roundMode: "MATCH_QUOTA",
      scoringEntryMode: "QUICK",
      isTestRound: false
    }),
    runScoreWriteTransaction: async (input) => {
      const previousScoreVersion = 0;
      const { score, updatedFields } = applyScoreWriteOperation(
        { ...input.initialScore, scoreVersion: previousScoreVersion + 1 },
        input.operation,
        "2026-07-18T18:00:00.000Z"
      );
      return {
        previousScoreVersion,
        scoreVersion: score.scoreVersion,
        alreadyApplied: false,
        updatedFields
      };
    },
    createOperationId: () => "operation-1",
    ...overrides
  };
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, any>;
}

test("regular-round server rollout flag defaults to false unless explicitly true", () => {
  assert.equal(isRegularRoundScoreMirrorServerEnabled({}), false);
  assert.equal(
    isRegularRoundScoreMirrorServerEnabled({ FIREBASE_REGULAR_ROUND_SCORE_MIRROR_ENABLED: "" }),
    false
  );
  assert.equal(
    isRegularRoundScoreMirrorServerEnabled({ FIREBASE_REGULAR_ROUND_SCORE_MIRROR_ENABLED: "false" }),
    false
  );
  assert.equal(
    isRegularRoundScoreMirrorServerEnabled({ FIREBASE_REGULAR_ROUND_SCORE_MIRROR_ENABLED: "TRUE" }),
    false
  );
  assert.equal(
    isRegularRoundScoreMirrorServerEnabled({ FIREBASE_REGULAR_ROUND_SCORE_MIRROR_ENABLED: "true" }),
    true
  );
});

test("unauthenticated and invalid token requests are denied with JSON", async () => {
  const missing = await handleScoreWriteRequest(makeRequest({}, ""), makeAdapters());
  const invalid = await handleScoreWriteRequest(makeRequest({}, "bad-token"), makeAdapters());

  assert.equal(missing.status, 401);
  assert.match(String((await readJson(missing)).error), /Sign in/);
  assert.equal(invalid.status, 401);
  assert.match(String((await readJson(invalid)).error), /Invalid Firebase ID token/);
});

test("active owner, admin, scorekeeper, and member roles can write only after membership is verified", async () => {
  for (const role of ["owner", "admin", "scorekeeper", "member"] as const) {
    const membership: ScoreWriteMembership = { role, status: "active" };
    const response = await handleScoreWriteRequest(
      makeRequest(),
      makeAdapters({ readClubMembership: async () => membership })
    );
    const json = await readJson(response);

    assert.equal(response.status, 200);
    assert.equal(json.ok, true);
    assert.equal(json.operationType, "set-hole");
    assert.equal(json.scoreVersion, 1);
  }
});

test("non-members and inactive members are denied", async () => {
  const nonMember = await handleScoreWriteRequest(
    makeRequest(),
    makeAdapters({ readClubMembership: async () => null })
  );
  const inactive = await handleScoreWriteRequest(
    makeRequest(),
    makeAdapters({ readClubMembership: async () => ({ role: "member", status: "removed" }) })
  );

  assert.equal(nonMember.status, 403);
  assert.match(String((await readJson(nonMember)).error), /not a member/);
  assert.equal(inactive.status, 403);
  assert.match(String((await readJson(inactive)).error), /not active/);
});

test("score writes are gated to the active matching test round", async () => {
  const noRound = await handleScoreWriteRequest(
    makeRequest(),
    makeAdapters({ readActivePrismaRoundScores: async () => null })
  );
  const mismatch = await handleScoreWriteRequest(
    makeRequest({ expectedPrismaRoundId: "wrong-round" }),
    makeAdapters()
  );
  const regularRound = await handleScoreWriteRequest(
    makeRequest(),
    makeAdapters({ readActivePrismaRoundScores: async () => makeRound({ isTestRound: false }) })
  );
  const closedRound = await handleScoreWriteRequest(
    makeRequest(),
    makeAdapters({
      readActivePrismaRoundScores: async () =>
        makeRound({ completedAt: "2026-07-18T20:00:00.000Z" })
    })
  );

  assert.equal(noRound.status, 409);
  assert.equal(mismatch.status, 409);
  assert.equal(regularRound.status, 403);
  assert.equal(closedRound.status, 409);
});

test("regular-round score mirroring is denied when the private server flag is false", async () => {
  const response = await handleScoreWriteRequest(
    makeRequest({ operation: { type: "set-quick-front", value: 1 } }),
    makeAdapters({
      readActivePrismaRoundScores: async () =>
        makeRound({
          isTestRound: false,
          entries: [makeEntry({ quickFrontNine: 1 })]
        }),
      isRegularRoundScoreMirrorEnabled: () => false
    })
  );

  assert.equal(response.status, 403);
  assert.match(String((await readJson(response)).error), /disabled/);
});

test("regular-round score mirroring requires a matching Firestore round shell", async () => {
  const missingShell = await handleScoreWriteRequest(
    makeRequest({ operation: { type: "set-quick-front", value: 1 } }),
    makeAdapters({
      readActivePrismaRoundScores: async () =>
        makeRound({
          isTestRound: false,
          entries: [makeEntry({ quickFrontNine: 1 })]
        }),
      readFirestoreRoundShell: async () => null,
      isRegularRoundScoreMirrorEnabled: () => true
    })
  );
  const mismatchedShell = await handleScoreWriteRequest(
    makeRequest({ operation: { type: "set-quick-front", value: 1 } }),
    makeAdapters({
      readActivePrismaRoundScores: async () =>
        makeRound({
          isTestRound: false,
          entries: [makeEntry({ quickFrontNine: 1 })]
        }),
      readFirestoreRoundShell: async () => ({
        prismaRoundId: "round-1",
        roundMode: "SKINS_ONLY",
        scoringEntryMode: "QUICK",
        isTestRound: false
      }),
      isRegularRoundScoreMirrorEnabled: () => true
    })
  );

  assert.equal(missingShell.status, 409);
  assert.match(String((await readJson(missingShell)).error), /round shell/);
  assert.equal(mismatchedShell.status, 409);
  assert.match(String((await readJson(mismatchedShell)).error), /does not match/);
});

test("regular-round score mirroring is allowed only after Prisma state matches the granular request", async () => {
  let writeCount = 0;
  const response = await handleScoreWriteRequest(
    makeRequest({ operation: { type: "set-quick-front", value: 1 } }),
    makeAdapters({
      readActivePrismaRoundScores: async () =>
        makeRound({
          isTestRound: false,
          entries: [makeEntry({ quickFrontNine: 1 })]
        }),
      isRegularRoundScoreMirrorEnabled: () => true,
      runScoreWriteTransaction: async (input) => {
        writeCount += 1;
        return {
          previousScoreVersion: 0,
          scoreVersion: 1,
          alreadyApplied: false,
          updatedFields: [input.operation.type]
        };
      }
    })
  );
  const mismatch = await handleScoreWriteRequest(
    makeRequest({ operation: { type: "set-quick-front", value: 2 } }),
    makeAdapters({
      readActivePrismaRoundScores: async () =>
        makeRound({
          isTestRound: false,
          entries: [makeEntry({ quickFrontNine: 1 })]
        }),
      isRegularRoundScoreMirrorEnabled: () => true
    })
  );

  assert.equal(response.status, 200);
  assert.equal((await readJson(response)).scoreVersion, 1);
  assert.equal(writeCount, 1);
  assert.equal(mismatch.status, 409);
  assert.match(String((await readJson(mismatch)).error), /Latest Prisma score/);
});

test("test-round score writes still work when regular-round flags are false", async () => {
  const response = await handleScoreWriteRequest(
    makeRequest({ operation: { type: "set-quick-front", value: 1 } }),
    makeAdapters({
      readActivePrismaRoundScores: async () =>
        makeRound({
          isTestRound: true,
          entries: [makeEntry({ quickFrontNine: null })]
        }),
      isRegularRoundScoreMirrorEnabled: () => false
    })
  );

  assert.equal(response.status, 200);
  assert.equal((await readJson(response)).operationType, "set-quick-front");
});

test("request validation rejects wrong project, unknown player, duplicates, and protected fields", async () => {
  const wrongProject = await handleScoreWriteRequest(
    makeRequest({ expectedProjectId: "other-project" }),
    makeAdapters()
  );
  const unknownPlayer = await handleScoreWriteRequest(
    makeRequest({ prismaPlayerId: "missing-player" }),
    makeAdapters()
  );
  const duplicatePlayer = await handleScoreWriteRequest(
    makeRequest(),
    makeAdapters({
      readActivePrismaRoundScores: async () =>
        makeRound({ entries: [makeEntry(), makeEntry({ id: "entry-2" })] })
    })
  );
  const protectedField = await handleScoreWriteRequest(
    makeRequest({ operation: { type: "set-hole", holeNumber: 1, value: 2, checksum: "bad" } }),
    makeAdapters()
  );

  assert.equal(wrongProject.status, 400);
  assert.equal(unknownPlayer.status, 404);
  assert.equal(duplicatePlayer.status, 409);
  assert.equal(protectedField.status, 400);
});

test("granular operations update exactly one logical score field", () => {
  const base = initialScore();
  const setHole = applyScoreWriteOperation({ ...base, scoreVersion: 2 }, { type: "set-hole", holeNumber: 7, value: 4 }, "2026-07-18T18:00:00.000Z");
  const quickFront = applyScoreWriteOperation({ ...base, scoreVersion: 2 }, { type: "set-quick-front", value: 16 }, "2026-07-18T18:00:00.000Z");
  const quickBack = applyScoreWriteOperation({ ...base, scoreVersion: 2 }, { type: "set-quick-back", value: 15 }, "2026-07-18T18:00:00.000Z");
  const birds = applyScoreWriteOperation({ ...base, scoreVersion: 2 }, { type: "set-birdie-holes", value: [{ holeNumber: 3, type: "birdie", score: 4 }] }, "2026-07-18T18:00:00.000Z");
  const front = applyScoreWriteOperation({ ...base, scoreVersion: 2 }, { type: "submit-front" }, "2026-07-18T18:00:00.000Z");
  const back = applyScoreWriteOperation({ ...base, scoreVersion: 2 }, { type: "submit-back" }, "2026-07-18T18:00:00.000Z");

  assert.deepEqual(setHole.updatedFields, ["holes.7"]);
  assert.equal(setHole.score.holes["7"], 4);
  assert.deepEqual(quickFront.updatedFields, ["quickFrontNine"]);
  assert.equal(quickFront.score.quickFrontNine, 16);
  assert.deepEqual(quickBack.updatedFields, ["quickBackNine"]);
  assert.equal(quickBack.score.quickBackNine, 15);
  assert.deepEqual(birds.updatedFields, ["birdieHoles"]);
  assert.equal(birds.score.birdieHoles.length, 1);
  assert.deepEqual(front.updatedFields, ["frontSubmittedAt"]);
  assert.deepEqual(back.updatedFields, ["backSubmittedAt"]);
});

test("quick score operations are rejected for detailed scoring mode", () => {
  const base = initialScore(makeRound({ scoringEntryMode: "DETAILED" }));

  assert.throws(
    () => applyScoreWriteOperation({ ...base, scoreVersion: 2 }, { type: "set-quick-front", value: 12 }, "2026-07-18T18:00:00.000Z"),
    /QUICK scoring mode/
  );
});

test("latest Prisma score verification compares only the requested granular field", () => {
  const latest = initialScore(makeRound({ entries: [makeEntry({ quickFrontNine: 1, quickBackNine: 0 })] }));

  assert.doesNotThrow(() =>
    assertOperationMatchesLatestPrismaScore({ type: "set-quick-front", value: 1 }, latest)
  );
  assert.throws(
    () => assertOperationMatchesLatestPrismaScore({ type: "set-quick-front", value: 2 }, latest),
    /Latest Prisma score/
  );
});

test("transaction adapter can enforce idempotency and score version conflicts", async () => {
  let savedClientRequestId: string | null = null;
  const alreadyApplied = await handleScoreWriteRequest(
    makeRequest({ clientRequestId: "request-1" }),
    makeAdapters({
      runScoreWriteTransaction: async (input) => {
        savedClientRequestId = input.clientRequestId;
        return {
          previousScoreVersion: 3,
          scoreVersion: 3,
          alreadyApplied: true,
          updatedFields: []
        };
      }
    })
  );
  const conflict = await handleScoreWriteRequest(
    makeRequest({ expectedScoreVersion: 1 }),
    makeAdapters({
      runScoreWriteTransaction: async () => {
        throw Object.assign(new Error("Score version conflict."), {
          status: 409,
          currentScoreVersion: 4
        });
      }
    })
  );

  assert.equal(alreadyApplied.status, 200);
  assert.equal((await readJson(alreadyApplied)).alreadyApplied, true);
  assert.equal(savedClientRequestId, "request-1");
  assert.equal(conflict.status, 409);
  assert.equal((await readJson(conflict)).currentScoreVersion, 4);
});

test("first missing-document operation is version 1 and second logical operation is version 2", async () => {
  let existing: FirestoreScoreWriteDocument | null = null;
  const adapters = makeAdapters({
    runScoreWriteTransaction: async (input) => {
      const current = existing ?? { ...input.initialScore, scoreVersion: 0 };
      const previousScoreVersion = current.scoreVersion;
      const { score, updatedFields } = applyScoreWriteOperation(
        { ...current, scoreVersion: previousScoreVersion + 1 },
        input.operation,
        "2026-07-18T18:00:00.000Z"
      );
      existing = score;

      return {
        previousScoreVersion,
        scoreVersion: score.scoreVersion,
        alreadyApplied: false,
        updatedFields
      };
    }
  });

  const first = await handleScoreWriteRequest(
    makeRequest({ operation: { type: "set-quick-front", value: 1 }, clientRequestId: "first" }),
    adapters
  );
  const second = await handleScoreWriteRequest(
    makeRequest({ operation: { type: "set-quick-back", value: 2 }, clientRequestId: "second" }),
    adapters
  );

  assert.equal(first.status, 200);
  assert.equal((await readJson(first)).scoreVersion, 1);
  assert.equal(second.status, 200);
  assert.equal((await readJson(second)).scoreVersion, 2);
});

test("duplicate clientRequestId does not increment version", async () => {
  let existing: FirestoreScoreWriteDocument | null = null;
  const seenClientRequestIds = new Set<string>();
  const adapters = makeAdapters({
    runScoreWriteTransaction: async (input) => {
      const current = existing ?? { ...input.initialScore, scoreVersion: 0 };

      if (input.clientRequestId && seenClientRequestIds.has(input.clientRequestId)) {
        return {
          previousScoreVersion: current.scoreVersion,
          scoreVersion: current.scoreVersion,
          alreadyApplied: true,
          updatedFields: []
        };
      }

      const previousScoreVersion = current.scoreVersion;
      const { score, updatedFields } = applyScoreWriteOperation(
        { ...current, scoreVersion: previousScoreVersion + 1 },
        input.operation,
        "2026-07-18T18:00:00.000Z"
      );
      existing = { ...score, lastClientRequestId: input.clientRequestId };
      if (input.clientRequestId) {
        seenClientRequestIds.add(input.clientRequestId);
      }

      return {
        previousScoreVersion,
        scoreVersion: score.scoreVersion,
        alreadyApplied: false,
        updatedFields
      };
    }
  });

  const first = await handleScoreWriteRequest(
    makeRequest({ operation: { type: "set-quick-front", value: 1 }, clientRequestId: "same-request" }),
    adapters
  );
  const duplicate = await handleScoreWriteRequest(
    makeRequest({ operation: { type: "set-quick-front", value: 1 }, clientRequestId: "same-request" }),
    adapters
  );

  assert.equal((await readJson(first)).scoreVersion, 1);
  const duplicateJson = await readJson(duplicate);
  assert.equal(duplicateJson.scoreVersion, 1);
  assert.equal(duplicateJson.alreadyApplied, true);
});

test("existing Firestore score documents reject malformed, mismatched, or derived result fields", () => {
  const expected = initialScore();
  const goodData: FirestoreScoreWriteDocument = {
    ...expected,
    checksum: expected.checksum,
    source: "firestore-test",
    scoreVersion: 2
  };

  assert.equal(
    normalizeExistingScoreDocument("player-1", goodData, expected).scoreVersion,
    2
  );
  assert.throws(
    () => normalizeExistingScoreDocument("player-1", { ...goodData, checksum: undefined }, expected),
    /invalid checksum/
  );
  assert.throws(
    () => normalizeExistingScoreDocument("player-1", { ...goodData, source: "client" }, expected),
    /invalid source/
  );
  assert.throws(
    () => normalizeExistingScoreDocument("player-1", { ...goodData, totalPoints: 22 }, expected),
    /derived field totalPoints/
  );
  assert.throws(
    () => normalizeExistingScoreDocument("wrong-player", goodData, expected),
    /document ID/
  );
});
