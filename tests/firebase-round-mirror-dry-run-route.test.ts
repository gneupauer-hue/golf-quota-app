import test from "node:test";
import assert from "node:assert/strict";
import {
  handleRoundMirrorDryRunRequest,
  type RoundMirrorDryRunMembership,
  type RoundMirrorDryRunRouteAdapters
} from "@/lib/firebase/round-mirror-dry-run-route";
import { IREM_FIREBASE_PROJECT_ID } from "@/lib/firebase/player-mirror-seed";
import {
  mapPrismaRoundToFirebaseMirror,
  type PrismaRoundMirrorInput
} from "@/lib/firebase/round-mirror";
import {
  ROUND_MIRROR_PRISMA_ENTRY_SELECT,
  ROUND_MIRROR_PRISMA_ROUND_SELECT,
  selectActivePrismaRoundSetup
} from "@/lib/firebase/round-mirror-prisma";

const CREATED_AT = new Date("2026-07-16T12:00:00.000Z");
const UPDATED_AT = new Date("2026-07-16T12:05:00.000Z");

function makeRound(overrides: Partial<PrismaRoundMirrorInput> = {}): PrismaRoundMirrorInput {
  return {
    id: "round-1",
    roundName: "July 18, 2026",
    roundDate: "2026-07-18T13:00:00.000Z",
    roundMode: "MATCH_QUOTA",
    scoringEntryMode: "QUICK",
    isTestRound: false,
    teamCount: 4,
    notes: "Saturday round",
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    entries: [
      {
        id: "entry-1",
        playerId: "player-1",
        player: {
          id: "player-1",
          name: "Gary Neupauer",
          quota: 17,
          currentQuota: 16,
          startingQuota: 18,
          isActive: true,
          isRegular: true
        },
        startQuota: 18,
        team: "A",
        groupNumber: 1,
        teeTime: "9:00 AM"
      },
      {
        id: "entry-2",
        playerId: "player-2",
        player: {
          id: "player-2",
          name: "Joe Rubbico",
          quota: 20,
          currentQuota: null,
          startingQuota: 19,
          isActive: true,
          isRegular: false
        },
        startQuota: 19,
        team: "B",
        groupNumber: 1,
        teeTime: "9:00 AM"
      }
    ],
    ...overrides
  };
}

function makeRequest(
  body: unknown = {
    clubId: "club-1",
    expectedProjectId: IREM_FIREBASE_PROJECT_ID,
    expectedPrismaRoundId: "round-1"
  },
  token = "valid-token"
) {
  return new Request("http://localhost/api/firebase/round-mirror/dry-run", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
}

function makeAdapters(
  overrides: Partial<RoundMirrorDryRunRouteAdapters> = {}
): RoundMirrorDryRunRouteAdapters {
  return {
    verifyIdToken: async (idToken) => {
      if (idToken !== "valid-token") {
        throw Object.assign(new Error("Invalid Firebase ID token."), { status: 401 });
      }

      return { uid: "user-uid" };
    },
    verifyClub: async (clubId) => ({ id: clubId, name: "Irem Golf Quota" }),
    readClubMembership: async () => ({ role: "owner", status: "active" }),
    readActivePrismaRoundSetup: async () => makeRound(),
    readFirestoreRound: async () => null,
    readFirestoreRoundEntries: async () => [],
    readFirestoreActivePointer: async () => null,
    ...overrides
  };
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, any>;
}

test("unauthenticated requests are denied with JSON", async () => {
  const response = await handleRoundMirrorDryRunRequest(makeRequest(undefined, ""), makeAdapters());
  const json = await readJson(response);

  assert.equal(response.status, 401);
  assert.equal(json.ok, false);
  assert.match(String(json.error), /Sign in/);
});

test("invalid tokens are denied with JSON", async () => {
  const response = await handleRoundMirrorDryRunRequest(
    makeRequest(undefined, "bad-token"),
    makeAdapters()
  );
  const json = await readJson(response);

  assert.equal(response.status, 401);
  assert.equal(json.ok, false);
  assert.match(String(json.error), /Invalid Firebase ID token/);
});

test("non-member and inactive member are denied", async () => {
  const nonMember = await handleRoundMirrorDryRunRequest(
    makeRequest(),
    makeAdapters({ readClubMembership: async () => null })
  );
  const inactive = await handleRoundMirrorDryRunRequest(
    makeRequest(),
    makeAdapters({ readClubMembership: async () => ({ role: "owner", status: "removed" }) })
  );

  assert.equal(nonMember.status, 403);
  assert.match(String((await readJson(nonMember)).error), /not a member/);
  assert.equal(inactive.status, 403);
  assert.match(String((await readJson(inactive)).error), /not active/);
});

for (const role of ["member", "scorekeeper"] as const) {
  test(`${role} role is denied`, async () => {
    const membership: RoundMirrorDryRunMembership = { role, status: "active" };
    const response = await handleRoundMirrorDryRunRequest(
      makeRequest(),
      makeAdapters({ readClubMembership: async () => membership })
    );
    const json = await readJson(response);

    assert.equal(response.status, 403);
    assert.match(String(json.error), /owners and admins/);
  });
}

for (const role of ["owner", "admin"] as const) {
  test(`${role} role is allowed`, async () => {
    const membership: RoundMirrorDryRunMembership = { role, status: "active" };
    const response = await handleRoundMirrorDryRunRequest(
      makeRequest(),
      makeAdapters({ readClubMembership: async () => membership })
    );
    const json = await readJson(response);

    assert.equal(response.status, 200);
    assert.equal(json.ok, true);
    assert.equal(json.prismaRoundId, "round-1");
  });
}

test("wrong project is denied", async () => {
  const response = await handleRoundMirrorDryRunRequest(
    makeRequest({
      clubId: "club-1",
      expectedProjectId: "wrong-project",
      expectedPrismaRoundId: "round-1"
    }),
    makeAdapters()
  );
  const json = await readJson(response);

  assert.equal(response.status, 400);
  assert.match(String(json.error), /expectedProjectId/);
});

test("expected round mismatch is denied", async () => {
  const response = await handleRoundMirrorDryRunRequest(
    makeRequest({
      clubId: "club-1",
      expectedProjectId: IREM_FIREBASE_PROJECT_ID,
      expectedPrismaRoundId: "other-round"
    }),
    makeAdapters()
  );
  const json = await readJson(response);

  assert.equal(response.status, 409);
  assert.match(String(json.error), /expectedPrismaRoundId/);
});

test("no-active-round success requires expectedPrismaRoundId null", async () => {
  let firestoreReads = 0;
  const response = await handleRoundMirrorDryRunRequest(
    makeRequest({
      clubId: "club-1",
      expectedProjectId: IREM_FIREBASE_PROJECT_ID,
      expectedPrismaRoundId: null
    }),
    makeAdapters({
      readActivePrismaRoundSetup: async () => null,
      readFirestoreRound: async () => {
        firestoreReads += 1;
        return null;
      }
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(json.status, "no-active-round");
  assert.equal(json.prismaRoundId, null);
  assert.equal(json.writesPlanned, 0);
  assert.equal(json.writesApplied, 0);
  assert.equal(firestoreReads, 0);
});

test("no-active-round rejects non-null expected round ID", async () => {
  const response = await handleRoundMirrorDryRunRequest(
    makeRequest(),
    makeAdapters({ readActivePrismaRoundSetup: async () => null })
  );
  const json = await readJson(response);

  assert.equal(response.status, 409);
  assert.match(String(json.error), /must be null/);
});

test("Prisma setup selection excludes score, skins, payout, and posting fields", () => {
  const entrySelect = JSON.stringify(ROUND_MIRROR_PRISMA_ENTRY_SELECT);
  const roundSelect = JSON.stringify(ROUND_MIRROR_PRISMA_ROUND_SELECT);

  for (const blocked of [
    "hole1",
    "hole18",
    "quickFrontNine",
    "quickBackNine",
    "birdieHolesCsv",
    "frontSubmittedAt",
    "backSubmittedAt",
    "totalPoints",
    "nextQuota",
    "rank",
    "paidPlayerIds",
    "buyInPaidPlayerIds",
    "isPayoutLocked"
  ]) {
    assert.equal(entrySelect.includes(blocked), false, `${blocked} should not be selected`);
    assert.equal(roundSelect.includes(blocked), false, `${blocked} should not be selected`);
  }
});

test("Prisma round setup selection excludes fields missing from the Round model", () => {
  assert.equal("updatedAt" in ROUND_MIRROR_PRISMA_ROUND_SELECT, false);
});

test("selectActivePrismaRoundSetup reuses active selection without Prisma mutation", async () => {
  const calls: string[] = [];
  let findUniqueArgs: unknown = null;
  const client = {
    round: {
      findMany: async () => {
        calls.push("findMany");
        return [
          { id: "draft-new", lockedAt: null, startedAt: null, _count: { entries: 0 } },
          { id: "engaged", lockedAt: null, startedAt: null, _count: { entries: 2 } }
        ];
      },
      findUnique: async (args: unknown) => {
        calls.push("findUnique");
        findUniqueArgs = args;
        return makeRound({ id: "engaged" });
      }
    }
  };

  const round = await selectActivePrismaRoundSetup(client);

  assert.equal(round?.id, "engaged");
  assert.deepEqual(calls, ["findMany", "findUnique"]);
  assert.deepEqual((findUniqueArgs as any).select, ROUND_MIRROR_PRISMA_ROUND_SELECT);
  assert.equal("updateMany" in client.round, false);
});

test("score fields are never accepted by the mapper path", async () => {
  const response = await handleRoundMirrorDryRunRequest(
    makeRequest(),
    makeAdapters({
      readActivePrismaRoundSetup: async () =>
        makeRound({
          entries: [
            {
              ...makeRound().entries[0],
              hole1: 1
            } as unknown as PrismaRoundMirrorInput["entries"][number]
          ]
        })
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 500);
  assert.match(String(json.error), /must not include score field hole1/);
});

test("dry-run returns created, updated, unchanged, and extra audits without checksums", async () => {
  const round = makeRound();
  const expected = mapPrismaRoundToFirebaseMirror(round);
  const unchanged = expected.entries.find((entry) => entry.prismaPlayerId === "player-1")!;
  const response = await handleRoundMirrorDryRunRequest(
    makeRequest(),
    makeAdapters({
      readActivePrismaRoundSetup: async () => round,
      readFirestoreRound: async () => ({
        prismaRoundId: expected.round.prismaRoundId,
        checksum: "old-round-checksum"
      }),
      readFirestoreRoundEntries: async () => [
        { prismaPlayerId: "player-1", playerName: "Gary Neupauer", checksum: unchanged.checksum },
        { prismaPlayerId: "player-2", playerName: "Joe Rubbico", checksum: "old-entry-checksum" },
        { prismaPlayerId: "extra-player", playerName: "Extra Player", checksum: "extra-checksum" }
      ],
      readFirestoreActivePointer: async () => ({
        roundId: expected.activePointer.roundId,
        prismaRoundId: expected.activePointer.prismaRoundId,
        checksum: expected.activePointer.checksum
      })
    })
  );
  const json = await readJson(response);
  const payloadText = JSON.stringify(json);

  assert.equal(response.status, 200);
  assert.equal(json.round.counts.updated, 1);
  assert.deepEqual(json.entries.counts, { created: 0, updated: 1, unchanged: 1, extra: 1 });
  assert.deepEqual(json.entries.updated, [{ id: "player-2", name: "Joe Rubbico" }]);
  assert.deepEqual(json.entries.unchanged, [{ id: "player-1", name: "Gary Neupauer" }]);
  assert.deepEqual(json.entries.extra, [{ id: "extra-player", name: "Extra Player" }]);
  assert.deepEqual(json.activePointer.counts, { created: 0, updated: 0, unchanged: 1, extra: 0 });
  assert.equal(json.writesPlanned, 0);
  assert.equal(json.writesApplied, 0);
  assert.equal(payloadText.includes(expected.round.checksum), false);
  assert.equal(payloadText.includes(unchanged.checksum), false);
});

test("entry created and active-pointer updated audits are returned", async () => {
  const expected = mapPrismaRoundToFirebaseMirror(makeRound());
  const response = await handleRoundMirrorDryRunRequest(
    makeRequest(),
    makeAdapters({
      readFirestoreRound: async () => ({
        prismaRoundId: expected.round.prismaRoundId,
        checksum: expected.round.checksum
      }),
      readFirestoreRoundEntries: async () => [],
      readFirestoreActivePointer: async () => ({
        roundId: expected.activePointer.roundId,
        prismaRoundId: expected.activePointer.prismaRoundId,
        checksum: "old-pointer-checksum"
      })
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 200);
  assert.deepEqual(json.round.counts, { created: 0, updated: 0, unchanged: 1, extra: 0 });
  assert.deepEqual(json.entries.counts, { created: 2, updated: 0, unchanged: 0, extra: 0 });
  assert.deepEqual(json.activePointer.counts, { created: 0, updated: 1, unchanged: 0, extra: 0 });
});

test("dry-run never writes and does not mutate Prisma input data", async () => {
  const prismaRound = makeRound();
  const snapshot = structuredClone(prismaRound);
  const response = await handleRoundMirrorDryRunRequest(
    makeRequest(),
    makeAdapters({ readActivePrismaRoundSetup: async () => prismaRound })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(prismaRound, snapshot);
});

test("malformed request fields return JSON errors", async () => {
  const response = await handleRoundMirrorDryRunRequest(
    makeRequest({
      clubId: "",
      expectedProjectId: IREM_FIREBASE_PROJECT_ID,
      expectedPrismaRoundId: "round-1"
    }),
    makeAdapters()
  );
  const json = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(json.ok, false);
  assert.match(String(json.error), /clubId/);
});
