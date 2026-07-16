import test from "node:test";
import assert from "node:assert/strict";
import {
  handlePlayerMirrorSyncRequest,
  type PlayerMirrorSyncMembership,
  type PlayerMirrorSyncRouteAdapters
} from "@/lib/firebase/player-mirror-sync-route";
import {
  IREM_FIREBASE_PROJECT_ID,
  type PlayerMirrorSeedAdapters
} from "@/lib/firebase/player-mirror-seed";
import { mapPrismaPlayerToFirebaseMirror, type PrismaPlayerMirrorInput } from "@/lib/firebase/player-mirror";

const UPDATED_AT = new Date("2026-07-16T12:00:00.000Z");

function makePlayer(overrides: Partial<PrismaPlayerMirrorInput> = {}): PrismaPlayerMirrorInput {
  return {
    id: "player-1",
    name: "Gary Neupauer",
    quota: 17,
    currentQuota: 16,
    startingQuota: 18,
    isActive: true,
    isRegular: true,
    updatedAt: UPDATED_AT,
    conflictsFrom: [],
    _count: { roundEntries: 4 },
    ...overrides
  };
}

function makeRequest(
  body: unknown = {
    clubId: "club-1",
    mode: "dry-run",
    expectedProjectId: IREM_FIREBASE_PROJECT_ID,
    expectedPrismaPlayerCount: 1
  },
  token = "valid-token"
) {
  return new Request("http://localhost/api/firebase/player-mirror/sync", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
}

function makeAdapters(
  overrides: Partial<PlayerMirrorSyncRouteAdapters> = {}
): PlayerMirrorSyncRouteAdapters {
  return {
    verifyIdToken: async (idToken) => {
      if (idToken !== "valid-token") {
        throw Object.assign(new Error("Invalid Firebase ID token."), { status: 401 });
      }

      return { uid: "owner-uid" };
    },
    verifyClub: async (clubId) => ({ id: clubId, name: "Irem Golf Quota" }),
    readClubMembership: async () => ({ role: "owner", status: "active" }),
    readPrismaPlayers: async () => [makePlayer()],
    readFirestorePlayers: async () => [],
    writePlayerMirrors: async () => {
      throw new Error("Dry-run should not write.");
    },
    ...overrides
  };
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

test("unauthenticated requests are denied with JSON", async () => {
  const response = await handlePlayerMirrorSyncRequest(makeRequest(undefined, ""), makeAdapters());
  const json = await readJson(response);

  assert.equal(response.status, 401);
  assert.equal(json.ok, false);
  assert.match(String(json.error), /Sign in/);
});

test("invalid tokens are denied with JSON", async () => {
  const response = await handlePlayerMirrorSyncRequest(
    makeRequest(undefined, "bad-token"),
    makeAdapters()
  );
  const json = await readJson(response);

  assert.equal(response.status, 401);
  assert.equal(json.ok, false);
  assert.match(String(json.error), /Invalid Firebase ID token/);
});

test("missing club is denied", async () => {
  const response = await handlePlayerMirrorSyncRequest(
    makeRequest(),
    makeAdapters({ verifyClub: async () => null })
  );
  const json = await readJson(response);

  assert.equal(response.status, 404);
  assert.match(String(json.error), /was not found/);
});

test("non-member is denied", async () => {
  const response = await handlePlayerMirrorSyncRequest(
    makeRequest(),
    makeAdapters({ readClubMembership: async () => null })
  );
  const json = await readJson(response);

  assert.equal(response.status, 403);
  assert.match(String(json.error), /not a member/);
});

test("inactive member is denied", async () => {
  const response = await handlePlayerMirrorSyncRequest(
    makeRequest(),
    makeAdapters({ readClubMembership: async () => ({ role: "owner", status: "removed" }) })
  );
  const json = await readJson(response);

  assert.equal(response.status, 403);
  assert.match(String(json.error), /not active/);
});

for (const role of ["member", "scorekeeper", "admin"] as const) {
  test(`${role} role is denied`, async () => {
    const membership: PlayerMirrorSyncMembership = { role, status: "active" };
    const response = await handlePlayerMirrorSyncRequest(
      makeRequest(),
      makeAdapters({ readClubMembership: async () => membership })
    );
    const json = await readJson(response);

    assert.equal(response.status, 403);
    assert.match(String(json.error), /Only the club owner/);
  });
}

test("owner dry-run is allowed and returns audit counts without checksums", async () => {
  const player = makePlayer();
  const mirror = mapPrismaPlayerToFirebaseMirror(player);
  const response = await handlePlayerMirrorSyncRequest(
    makeRequest(),
    makeAdapters({
      readPrismaPlayers: async () => [player],
      readFirestorePlayers: async () => [{ prismaPlayerId: player.id, checksum: mirror.checksum }]
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.mode, "dry-run");
  assert.deepEqual(json.counts, {
    prismaPlayers: 1,
    firestorePlayers: 1,
    created: 0,
    updated: 0,
    unchanged: 1,
    extra: 0
  });
  assert.equal(json.writesPlanned, 0);
  assert.equal(json.writesApplied, 0);
  assert.equal(JSON.stringify(json).includes(mirror.checksum), false);
});

test("wrong project is denied", async () => {
  const response = await handlePlayerMirrorSyncRequest(
    makeRequest({
      clubId: "club-1",
      mode: "dry-run",
      expectedProjectId: "wrong-project",
      expectedPrismaPlayerCount: 1
    }),
    makeAdapters()
  );
  const json = await readJson(response);

  assert.equal(response.status, 400);
  assert.match(String(json.error), /expectedProjectId/);
});

test("missing expected count is denied", async () => {
  const response = await handlePlayerMirrorSyncRequest(
    makeRequest({
      clubId: "club-1",
      mode: "dry-run",
      expectedProjectId: IREM_FIREBASE_PROJECT_ID
    }),
    makeAdapters()
  );
  const json = await readJson(response);

  assert.equal(response.status, 400);
  assert.match(String(json.error), /expectedPrismaPlayerCount/);
});

test("mismatched expected count is denied", async () => {
  const response = await handlePlayerMirrorSyncRequest(
    makeRequest({
      clubId: "club-1",
      mode: "dry-run",
      expectedProjectId: IREM_FIREBASE_PROJECT_ID,
      expectedPrismaPlayerCount: 2
    }),
    makeAdapters()
  );
  const json = await readJson(response);

  assert.equal(response.status, 500);
  assert.match(String(json.error), /Prisma player count mismatch/);
});

test("unsupported mode is denied", async () => {
  const response = await handlePlayerMirrorSyncRequest(
    makeRequest({
      clubId: "club-1",
      mode: "write",
      expectedProjectId: IREM_FIREBASE_PROJECT_ID,
      expectedPrismaPlayerCount: 1
    }),
    makeAdapters()
  );
  const json = await readJson(response);

  assert.equal(response.status, 400);
  assert.match(String(json.error), /dry-run/);
});

test("dry-run never writes", async () => {
  let writes = 0;
  const response = await handlePlayerMirrorSyncRequest(
    makeRequest(),
    makeAdapters({
      writePlayerMirrors: async () => {
        writes += 1;
      }
    })
  );

  assert.equal(response.status, 200);
  assert.equal(writes, 0);
});

test("malformed request fields return JSON errors", async () => {
  const response = await handlePlayerMirrorSyncRequest(
    makeRequest({
      clubId: "",
      mode: "dry-run",
      expectedProjectId: IREM_FIREBASE_PROJECT_ID,
      expectedPrismaPlayerCount: 1
    }),
    makeAdapters()
  );
  const json = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(json.ok, false);
  assert.match(String(json.error), /clubId/);
});

test("dry-run does not mutate Prisma input data", async () => {
  const prismaPlayers = [makePlayer()];
  const snapshot = structuredClone(prismaPlayers);
  const adapters: Partial<PlayerMirrorSeedAdapters> = {
    readPrismaPlayers: async () => prismaPlayers,
    readFirestorePlayers: async () => []
  };

  const response = await handlePlayerMirrorSyncRequest(makeRequest(), makeAdapters(adapters));

  assert.equal(response.status, 200);
  assert.deepEqual(prismaPlayers, snapshot);
});
