import test from "node:test";
import assert from "node:assert/strict";
import {
  handleRoundMirrorClearRequest,
  type RoundMirrorClearRouteAdapters
} from "@/lib/firebase/round-mirror-clear-route";
import { IREM_FIREBASE_PROJECT_ID } from "@/lib/firebase/player-mirror-seed";

function makeRequest(
  body: unknown = {
    clubId: "club-1",
    expectedProjectId: IREM_FIREBASE_PROJECT_ID,
    expectedFirestoreRoundId: "round-1",
    confirmClear: true
  },
  token = "valid-token"
) {
  return new Request("http://localhost/api/firebase/round-mirror/clear", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
}

function makeAdapters(
  overrides: Partial<RoundMirrorClearRouteAdapters> = {}
): RoundMirrorClearRouteAdapters {
  return {
    verifyIdToken: async (idToken) => {
      if (idToken !== "valid-token") {
        throw Object.assign(new Error("Invalid Firebase ID token."), { status: 401 });
      }

      return { uid: "user-uid" };
    },
    verifyClub: async (clubId) => ({ id: clubId, name: "Irem Golf Quota" }),
    readClubMembership: async () => ({ role: "owner", status: "active" }),
    readActivePrismaRoundId: async () => null,
    readFirestoreRound: async (_clubId, roundId) => ({
      docId: roundId,
      prismaRoundId: roundId,
      isTestRound: true
    }),
    readFirestoreActivePointer: async () => ({
      roundId: "round-1",
      prismaRoundId: "round-1"
    }),
    acquireRoundMirrorClearLock: async () => async () => undefined,
    clearRoundMirror: async () => ({
      entriesDeleted: 2,
      roundDeleted: true,
      pointerCleared: true,
      writesApplied: 4
    }),
    ...overrides
  };
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, any>;
}

test("unauthenticated requests are denied with JSON", async () => {
  const response = await handleRoundMirrorClearRequest(makeRequest(undefined, ""), makeAdapters());
  const json = await readJson(response);

  assert.equal(response.status, 401);
  assert.equal(json.ok, false);
  assert.match(String(json.error), /Sign in/);
});

test("invalid tokens are denied with JSON", async () => {
  const response = await handleRoundMirrorClearRequest(
    makeRequest(undefined, "bad-token"),
    makeAdapters()
  );
  const json = await readJson(response);

  assert.equal(response.status, 401);
  assert.equal(json.ok, false);
  assert.match(String(json.error), /Invalid Firebase ID token/);
});

test("member, scorekeeper, inactive member, and non-member are denied", async () => {
  for (const membership of [
    null,
    { role: "member", status: "active" },
    { role: "scorekeeper", status: "active" },
    { role: "owner", status: "removed" }
  ]) {
    const response = await handleRoundMirrorClearRequest(
      makeRequest(),
      makeAdapters({ readClubMembership: async () => membership })
    );
    const json = await readJson(response);

    assert.equal(response.status, 403);
    assert.equal(json.ok, false);
  }
});

for (const role of ["owner", "admin"] as const) {
  test(`${role} role can clear a stale mirrored test round`, async () => {
    const response = await handleRoundMirrorClearRequest(
      makeRequest(),
      makeAdapters({ readClubMembership: async () => ({ role, status: "active" }) })
    );
    const json = await readJson(response);

    assert.equal(response.status, 200);
    assert.equal(json.ok, true);
    assert.equal(json.clearedRoundId, "round-1");
    assert.equal(json.entriesDeleted, 2);
    assert.equal(json.roundDeleted, true);
    assert.equal(json.pointerCleared, true);
    assert.equal(json.writesApplied, 4);
  });
}

test("confirmation is required", async () => {
  const response = await handleRoundMirrorClearRequest(
    makeRequest({
      clubId: "club-1",
      expectedProjectId: IREM_FIREBASE_PROJECT_ID,
      expectedFirestoreRoundId: "round-1"
    }),
    makeAdapters()
  );
  const json = await readJson(response);

  assert.equal(response.status, 400);
  assert.match(String(json.error), /confirmClear/);
});

test("wrong project is denied", async () => {
  const response = await handleRoundMirrorClearRequest(
    makeRequest({
      clubId: "club-1",
      expectedProjectId: "wrong-project",
      expectedFirestoreRoundId: "round-1",
      confirmClear: true
    }),
    makeAdapters()
  );
  const json = await readJson(response);

  assert.equal(response.status, 400);
  assert.match(String(json.error), /expectedProjectId/);
});

test("non-test round is denied", async () => {
  const response = await handleRoundMirrorClearRequest(
    makeRequest(),
    makeAdapters({
      readFirestoreRound: async (_clubId, roundId) => ({
        docId: roundId,
        prismaRoundId: roundId,
        isTestRound: false
      })
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 409);
  assert.match(String(json.error), /test rounds/);
});

test("active Prisma round blocks cleanup", async () => {
  const response = await handleRoundMirrorClearRequest(
    makeRequest(),
    makeAdapters({ readActivePrismaRoundId: async () => "round-1" })
  );
  const json = await readJson(response);

  assert.equal(response.status, 409);
  assert.match(String(json.error), /Prisma round is still active/);
});

test("pointer mismatch is denied", async () => {
  const response = await handleRoundMirrorClearRequest(
    makeRequest(),
    makeAdapters({
      readFirestoreActivePointer: async () => ({
        roundId: "other-round",
        prismaRoundId: "other-round"
      })
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 409);
  assert.match(String(json.error), /pointer/);
});

test("round mismatch is denied", async () => {
  const response = await handleRoundMirrorClearRequest(
    makeRequest(),
    makeAdapters({
      readFirestoreRound: async () => ({
        docId: "round-1",
        prismaRoundId: "other-round",
        isTestRound: true
      })
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 409);
  assert.match(String(json.error), /mismatched Prisma round ID/);
});

test("missing or malformed active pointer is denied", async () => {
  const missing = await handleRoundMirrorClearRequest(
    makeRequest(),
    makeAdapters({ readFirestoreActivePointer: async () => null })
  );
  const malformed = await handleRoundMirrorClearRequest(
    makeRequest(),
    makeAdapters({ readFirestoreActivePointer: async () => ({ prismaRoundId: "round-1" }) })
  );

  assert.equal(missing.status, 409);
  assert.match(String((await readJson(missing)).error), /pointer/);
  assert.equal(malformed.status, 409);
  assert.match(String((await readJson(malformed)).error), /pointer/);
});

test("lock blocks overlapping clear requests", async () => {
  const response = await handleRoundMirrorClearRequest(
    makeRequest(),
    makeAdapters({
      acquireRoundMirrorClearLock: async () => {
        throw Object.assign(new Error("Round mirror operation is already running."), {
          status: 409
        });
      }
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 409);
  assert.match(String(json.error), /already running/);
});

test("expired lock can recover when the lock adapter grants a new lock", async () => {
  let released = false;
  const response = await handleRoundMirrorClearRequest(
    makeRequest(),
    makeAdapters({
      acquireRoundMirrorClearLock: async () => async () => {
        released = true;
      }
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  assert.equal(released, true);
});

test("successful cleanup reports deleted paths and does not touch unrelated data", async () => {
  const touched: string[] = [];
  const response = await handleRoundMirrorClearRequest(
    makeRequest(),
    makeAdapters({
      clearRoundMirror: async (_clubId, roundId) => {
        touched.push(`rounds/${roundId}/entries/player-1`);
        touched.push(`rounds/${roundId}/entries/player-2`);
        touched.push(`rounds/${roundId}`);
        touched.push("state/activeRound");
        return {
          entriesDeleted: 2,
          roundDeleted: true,
          pointerCleared: true,
          writesApplied: 4
        };
      }
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  assert.deepEqual(touched, [
    "rounds/round-1/entries/player-1",
    "rounds/round-1/entries/player-2",
    "rounds/round-1",
    "state/activeRound"
  ]);
  assert.equal(touched.some((path) => path.includes("players")), false);
});

test("batch failure reports no false success", async () => {
  const response = await handleRoundMirrorClearRequest(
    makeRequest(),
    makeAdapters({
      clearRoundMirror: async () => {
        throw new Error("batch failed");
      }
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 500);
  assert.equal(json.ok, false);
  assert.equal(json.entriesDeleted, 0);
  assert.equal(json.roundDeleted, false);
  assert.equal(json.pointerCleared, false);
  assert.equal(json.writesApplied, 0);
  assert.match(String(json.error), /batch failed/);
});

test("cleanup does not mutate Prisma state", async () => {
  let prismaReads = 0;
  const response = await handleRoundMirrorClearRequest(
    makeRequest(),
    makeAdapters({
      readActivePrismaRoundId: async () => {
        prismaReads += 1;
        return null;
      }
    })
  );

  assert.equal(response.status, 200);
  assert.equal(prismaReads, 1);
});

test("malformed request fields return JSON errors", async () => {
  const response = await handleRoundMirrorClearRequest(
    makeRequest({
      clubId: "",
      expectedProjectId: IREM_FIREBASE_PROJECT_ID,
      expectedFirestoreRoundId: "round-1",
      confirmClear: true
    }),
    makeAdapters()
  );
  const json = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(json.ok, false);
  assert.match(String(json.error), /clubId/);
});
