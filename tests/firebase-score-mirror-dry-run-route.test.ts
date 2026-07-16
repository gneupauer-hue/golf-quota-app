import test from "node:test";
import assert from "node:assert/strict";
import {
  handleScoreMirrorDryRunRequest,
  type ScoreMirrorDryRunMembership,
  type ScoreMirrorDryRunRouteAdapters
} from "@/lib/firebase/score-mirror-dry-run-route";
import { IREM_FIREBASE_PROJECT_ID } from "@/lib/firebase/player-mirror-seed";
import {
  mapPrismaScoresToFirebaseMirror,
  type PrismaScoreMirrorEntryInput,
  type PrismaScoreMirrorRoundInput
} from "@/lib/firebase/score-mirror";
import {
  SCORE_MIRROR_PRISMA_ENTRY_SELECT,
  SCORE_MIRROR_PRISMA_ROUND_SELECT,
  selectActivePrismaRoundScores
} from "@/lib/firebase/score-mirror-prisma";

const SUBMITTED_AT = new Date("2026-07-18T18:00:00.000Z");

function makeEntry(overrides: Partial<PrismaScoreMirrorEntryInput> = {}): PrismaScoreMirrorEntryInput {
  return {
    id: "entry-1",
    playerId: "player-1",
    playerName: "Gary Neupauer",
    hole1: 1,
    hole2: 2,
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
    quickFrontNine: 17,
    quickBackNine: null,
    frontSubmittedAt: SUBMITTED_AT,
    backSubmittedAt: null,
    birdieHolesCsv: "2:birdie,7:eagle",
    ...overrides
  };
}

function makeRound(overrides: Partial<PrismaScoreMirrorRoundInput> = {}): PrismaScoreMirrorRoundInput {
  return {
    id: "round-1",
    roundMode: "MATCH_QUOTA",
    scoringEntryMode: "QUICK",
    entries: [
      makeEntry(),
      makeEntry({
        id: "entry-2",
        playerId: "player-2",
        playerName: "Joe Rubbico",
        hole1: null,
        hole2: null,
        quickFrontNine: null,
        quickBackNine: 15,
        frontSubmittedAt: null,
        backSubmittedAt: "2026-07-18T20:00:00.000Z",
        birdieHolesCsv: ""
      })
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
  return new Request("http://localhost/api/firebase/score-mirror/dry-run", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
}

function makeAdapters(
  overrides: Partial<ScoreMirrorDryRunRouteAdapters> = {}
): ScoreMirrorDryRunRouteAdapters {
  return {
    verifyIdToken: async (idToken) => {
      if (idToken !== "valid-token") {
        throw Object.assign(new Error("Invalid Firebase ID token."), { status: 401 });
      }

      return { uid: "user-uid" };
    },
    verifyClub: async (clubId) => ({ id: clubId, name: "Irem Golf Quota" }),
    readClubMembership: async () => ({ role: "owner", status: "active" }),
    readActivePrismaRoundScores: async () => makeRound(),
    readFirestoreScores: async () => [],
    ...overrides
  };
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, any>;
}

test("unauthenticated requests are denied with JSON", async () => {
  const response = await handleScoreMirrorDryRunRequest(makeRequest(undefined, ""), makeAdapters());
  const json = await readJson(response);

  assert.equal(response.status, 401);
  assert.equal(json.ok, false);
  assert.match(String(json.error), /Sign in/);
});

test("invalid tokens are denied with JSON", async () => {
  const response = await handleScoreMirrorDryRunRequest(
    makeRequest(undefined, "bad-token"),
    makeAdapters()
  );
  const json = await readJson(response);

  assert.equal(response.status, 401);
  assert.equal(json.ok, false);
  assert.match(String(json.error), /Invalid Firebase ID token/);
});

test("non-member and inactive member are denied", async () => {
  const nonMember = await handleScoreMirrorDryRunRequest(
    makeRequest(),
    makeAdapters({ readClubMembership: async () => null })
  );
  const inactive = await handleScoreMirrorDryRunRequest(
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
    const membership: ScoreMirrorDryRunMembership = { role, status: "active" };
    const response = await handleScoreMirrorDryRunRequest(
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
    const membership: ScoreMirrorDryRunMembership = { role, status: "active" };
    const response = await handleScoreMirrorDryRunRequest(
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
  const response = await handleScoreMirrorDryRunRequest(
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
  const response = await handleScoreMirrorDryRunRequest(
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
  const response = await handleScoreMirrorDryRunRequest(
    makeRequest({
      clubId: "club-1",
      expectedProjectId: IREM_FIREBASE_PROJECT_ID,
      expectedPrismaRoundId: null
    }),
    makeAdapters({
      readActivePrismaRoundScores: async () => null,
      readFirestoreScores: async () => {
        firestoreReads += 1;
        return [];
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
  const response = await handleScoreMirrorDryRunRequest(
    makeRequest(),
    makeAdapters({ readActivePrismaRoundScores: async () => null })
  );
  const json = await readJson(response);

  assert.equal(response.status, 409);
  assert.match(String(json.error), /must be null/);
});

test("score-only Prisma selection excludes setup, payout, result, rank, and posting fields", () => {
  const entrySelect = JSON.stringify(SCORE_MIRROR_PRISMA_ENTRY_SELECT);
  const roundSelect = JSON.stringify(SCORE_MIRROR_PRISMA_ROUND_SELECT);
  const selected = `${entrySelect} ${roundSelect}`;

  for (const required of [
    "hole1",
    "hole18",
    "quickFrontNine",
    "quickBackNine",
    "frontSubmittedAt",
    "backSubmittedAt",
    "birdieHolesCsv",
    "roundMode",
    "scoringEntryMode"
  ]) {
    assert.equal(selected.includes(required), true, `${required} should be selected`);
  }

  for (const blocked of [
    "startQuota",
    "team",
    "groupNumber",
    "teeTime",
    "frontQuota",
    "backQuota",
    "frontNine",
    "backNine",
    "totalPoints",
    "plusMinus",
    "nextQuota",
    "rank",
    "paidPlayerIds",
    "buyInPaidPlayerIds",
    "isPayoutLocked",
    "settlement"
  ]) {
    assert.equal(selected.includes(blocked), false, `${blocked} should not be selected`);
  }
});

test("selectActivePrismaRoundScores reuses active selection without Prisma mutation", async () => {
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
        return {
          id: "engaged",
          roundMode: "MATCH_QUOTA",
          scoringEntryMode: "QUICK",
          entries: [
            {
              ...makeEntry(),
              player: { name: "Gary Neupauer" }
            }
          ]
        };
      }
    }
  };

  const round = await selectActivePrismaRoundScores(client);

  assert.equal(round?.id, "engaged");
  assert.deepEqual(calls, ["findMany", "findUnique"]);
  assert.deepEqual((findUniqueArgs as any).select, SCORE_MIRROR_PRISMA_ROUND_SELECT);
  assert.equal("updateMany" in client.round, false);
});

test("detailed score audit returns created documents", async () => {
  const response = await handleScoreMirrorDryRunRequest(
    makeRequest(),
    makeAdapters({
      readActivePrismaRoundScores: async () => makeRound({ scoringEntryMode: "DETAILED" })
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(json.scoringEntryMode, "DETAILED");
  assert.deepEqual(json.scores.counts, { created: 2, updated: 0, unchanged: 0, extra: 0 });
  assert.deepEqual(json.scores.created, [
    { id: "player-1", name: "Gary Neupauer" },
    { id: "player-2", name: "Joe Rubbico" }
  ]);
});

test("quick score, birdie-hole, and Firestore audits classify created, updated, unchanged, and extra", async () => {
  const round = makeRound();
  const expected = mapPrismaScoresToFirebaseMirror(round);
  const unchanged = expected.scores.find((score) => score.prismaPlayerId === "player-1")!;
  const response = await handleScoreMirrorDryRunRequest(
    makeRequest(),
    makeAdapters({
      readActivePrismaRoundScores: async () => round,
      readFirestoreScores: async () => [
        { prismaPlayerId: "player-1", checksum: unchanged.checksum },
        { prismaPlayerId: "player-2", checksum: "old-score-checksum" },
        { prismaPlayerId: "extra-player", playerName: "Extra Player", checksum: "extra-checksum" }
      ]
    })
  );
  const json = await readJson(response);
  const payloadText = JSON.stringify(json);

  assert.equal(response.status, 200);
  assert.equal(json.scoringEntryMode, "QUICK");
  assert.equal(json.roundMode, "MATCH_QUOTA");
  assert.deepEqual(json.scores.counts, { created: 0, updated: 1, unchanged: 1, extra: 1 });
  assert.deepEqual(json.scores.updated, [{ id: "player-2", name: "Joe Rubbico" }]);
  assert.deepEqual(json.scores.unchanged, [{ id: "player-1", name: "Gary Neupauer" }]);
  assert.deepEqual(json.scores.extra, [{ id: "extra-player", name: "Extra Player" }]);
  assert.equal(json.writesPlanned, 0);
  assert.equal(json.writesApplied, 0);
  assert.equal(payloadText.includes(unchanged.checksum), false);
});

test("invalid score mode, hole values, and birdie-hole inputs return JSON errors", async () => {
  const invalidMode = await handleScoreMirrorDryRunRequest(
    makeRequest(),
    makeAdapters({ readActivePrismaRoundScores: async () => makeRound({ scoringEntryMode: "OTHER" }) })
  );
  const invalidHole = await handleScoreMirrorDryRunRequest(
    makeRequest(),
    makeAdapters({ readActivePrismaRoundScores: async () => makeRound({ entries: [makeEntry({ hole1: 3 })] }) })
  );
  const invalidBirdie = await handleScoreMirrorDryRunRequest(
    makeRequest(),
    makeAdapters({
      readActivePrismaRoundScores: async () => makeRound({ entries: [makeEntry({ birdieHolesCsv: "bad-token" })] })
    })
  );

  assert.equal(invalidMode.status, 500);
  assert.match(String((await readJson(invalidMode)).error), /Scoring entry mode/);
  assert.equal(invalidHole.status, 500);
  assert.match(String((await readJson(invalidHole)).error), /Hole 1/);
  assert.equal(invalidBirdie.status, 500);
  assert.match(String((await readJson(invalidBirdie)).error), /Malformed birdie-hole/);
});

test("duplicate players are rejected before Firestore reads", async () => {
  let firestoreReads = 0;
  const response = await handleScoreMirrorDryRunRequest(
    makeRequest(),
    makeAdapters({
      readActivePrismaRoundScores: async () => makeRound({ entries: [makeEntry(), makeEntry({ id: "entry-2" })] }),
      readFirestoreScores: async () => {
        firestoreReads += 1;
        return [];
      }
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 500);
  assert.match(String(json.error), /Duplicate score entry player ID/);
  assert.equal(firestoreReads, 0);
});

test("dry-run never writes and does not mutate Prisma input data", async () => {
  const prismaRound = makeRound();
  const snapshot = structuredClone(prismaRound);
  const response = await handleScoreMirrorDryRunRequest(
    makeRequest(),
    makeAdapters({ readActivePrismaRoundScores: async () => prismaRound })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(prismaRound, snapshot);
});

test("malformed request fields return JSON errors", async () => {
  const response = await handleScoreMirrorDryRunRequest(
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
