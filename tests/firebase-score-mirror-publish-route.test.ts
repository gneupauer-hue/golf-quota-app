import test from "node:test";
import assert from "node:assert/strict";
import {
  handleScoreMirrorPublishRequest,
  type ScoreMirrorPublishMembership,
  type ScoreMirrorPublishRouteAdapters,
  type ScoreMirrorPublishWriteInput
} from "@/lib/firebase/score-mirror-publish-route";
import { IREM_FIREBASE_PROJECT_ID } from "@/lib/firebase/player-mirror-seed";
import {
  mapPrismaScoresToFirebaseMirror,
  type PrismaScoreMirrorEntryInput,
  type PrismaScoreMirrorRoundInput
} from "@/lib/firebase/score-mirror";

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
    expectedPrismaRoundId: "round-1",
    confirmPublish: true
  },
  token = "valid-token"
) {
  return new Request("http://localhost/api/firebase/score-mirror/publish", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
}

function makeAdapters(
  overrides: Partial<ScoreMirrorPublishRouteAdapters> = {}
): ScoreMirrorPublishRouteAdapters {
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
    acquireScoreMirrorPublishLock: async () => async () => undefined,
    writeScoreMirror: async () => {
      throw new Error("Unexpected write.");
    },
    createOperationId: () => "operation-1",
    ...overrides
  };
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, any>;
}

test("unauthenticated requests are denied with JSON", async () => {
  const response = await handleScoreMirrorPublishRequest(makeRequest(undefined, ""), makeAdapters());
  const json = await readJson(response);

  assert.equal(response.status, 401);
  assert.equal(json.ok, false);
  assert.match(String(json.error), /Sign in/);
});

test("invalid tokens are denied with JSON", async () => {
  const response = await handleScoreMirrorPublishRequest(
    makeRequest(undefined, "bad-token"),
    makeAdapters()
  );
  const json = await readJson(response);

  assert.equal(response.status, 401);
  assert.equal(json.ok, false);
  assert.match(String(json.error), /Invalid Firebase ID token/);
});

test("non-member and inactive member are denied", async () => {
  const nonMember = await handleScoreMirrorPublishRequest(
    makeRequest(),
    makeAdapters({ readClubMembership: async () => null })
  );
  const inactive = await handleScoreMirrorPublishRequest(
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
    const membership: ScoreMirrorPublishMembership = { role, status: "active" };
    const response = await handleScoreMirrorPublishRequest(
      makeRequest(),
      makeAdapters({ readClubMembership: async () => membership })
    );
    const json = await readJson(response);

    assert.equal(response.status, 403);
    assert.match(String(json.error), /owners and admins/);
  });
}

for (const role of ["owner", "admin"] as const) {
  test(`${role} role can publish`, async () => {
    const membership: ScoreMirrorPublishMembership = { role, status: "active" };
    const writes: ScoreMirrorPublishWriteInput[] = [];
    const response = await handleScoreMirrorPublishRequest(
      makeRequest(),
      makeAdapters({
        readClubMembership: async () => membership,
        writeScoreMirror: async (_clubId, _roundId, input) => {
          writes.push(input);
          return 2;
        }
      })
    );
    const json = await readJson(response);

    assert.equal(response.status, 200);
    assert.equal(json.ok, true);
    assert.equal(json.publishedRoundId, "round-1");
    assert.equal(json.operationId, "operation-1");
    assert.equal(json.writesApplied, 2);
    assert.equal(writes.length, 1);
  });
}

test("no active round is denied and releases the lock", async () => {
  let released = false;
  const response = await handleScoreMirrorPublishRequest(
    makeRequest(),
    makeAdapters({
      readActivePrismaRoundScores: async () => null,
      acquireScoreMirrorPublishLock: async () => async () => {
        released = true;
      }
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 409);
  assert.match(String(json.error), /no active Prisma round/);
  assert.equal(json.writesApplied, 0);
  assert.equal(released, true);
});

test("expected round mismatch is denied", async () => {
  const response = await handleScoreMirrorPublishRequest(
    makeRequest({
      clubId: "club-1",
      expectedProjectId: IREM_FIREBASE_PROJECT_ID,
      expectedPrismaRoundId: "other-round",
      confirmPublish: true
    }),
    makeAdapters()
  );
  const json = await readJson(response);

  assert.equal(response.status, 409);
  assert.match(String(json.error), /expectedPrismaRoundId/);
  assert.equal(json.writesApplied, 0);
});

test("legacy score publish blocks existing granular score-write history", async () => {
  const expectedScore = mapPrismaScoresToFirebaseMirror(makeRound()).scores[0];
  const response = await handleScoreMirrorPublishRequest(
    makeRequest(),
    makeAdapters({
      readFirestoreScores: async () => [
        {
          docId: expectedScore.prismaPlayerId,
          prismaPlayerId: expectedScore.prismaPlayerId,
          prismaEntryId: expectedScore.prismaEntryId,
          checksum: expectedScore.checksum,
          source: "firestore-test",
          scoreVersion: 2,
          lastOperationId: "op-1"
        }
      ]
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 409);
  assert.match(String(json.error), /granular score-write history/);
});

test("publish requires confirmPublish", async () => {
  const response = await handleScoreMirrorPublishRequest(
    makeRequest({
      clubId: "club-1",
      expectedProjectId: IREM_FIREBASE_PROJECT_ID,
      expectedPrismaRoundId: "round-1"
    }),
    makeAdapters()
  );
  const json = await readJson(response);

  assert.equal(response.status, 400);
  assert.match(String(json.error), /confirmPublish/);
});

test("wrong project is denied", async () => {
  const response = await handleScoreMirrorPublishRequest(
    makeRequest({
      clubId: "club-1",
      expectedProjectId: "wrong-project",
      expectedPrismaRoundId: "round-1",
      confirmPublish: true
    }),
    makeAdapters()
  );
  const json = await readJson(response);

  assert.equal(response.status, 400);
  assert.match(String(json.error), /expectedProjectId/);
});

test("extras block publish without writing", async () => {
  let writes = 0;
  const response = await handleScoreMirrorPublishRequest(
    makeRequest(),
    makeAdapters({
      readFirestoreScores: async () => [
        { docId: "extra-player", prismaPlayerId: "extra-player", checksum: "extra-checksum" }
      ],
      writeScoreMirror: async () => {
        writes += 1;
        return 1;
      }
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 409);
  assert.equal(json.ok, false);
  assert.equal(writes, 0);
  assert.equal(json.writesApplied, 0);
  assert.match(String(json.error), /extra Firestore/);
});

test("malformed Firestore score docs block publish", async () => {
  let writes = 0;
  const response = await handleScoreMirrorPublishRequest(
    makeRequest(),
    makeAdapters({
      readFirestoreScores: async () => [
        { docId: "player-1", prismaPlayerId: "player-1", checksum: "" }
      ],
      writeScoreMirror: async () => {
        writes += 1;
        return 1;
      }
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 500);
  assert.equal(writes, 0);
  assert.match(String(json.error), /missing checksum/);
});

test("Firestore score docs with mismatched IDs are rejected", async () => {
  const response = await handleScoreMirrorPublishRequest(
    makeRequest(),
    makeAdapters({
      readFirestoreScores: async () => [
        { docId: "wrong-doc-id", prismaPlayerId: "player-1", checksum: "checksum" }
      ]
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 500);
  assert.match(String(json.error), /document ID must match/);
});

test("Firestore score docs with mismatched Prisma entry IDs are rejected", async () => {
  const response = await handleScoreMirrorPublishRequest(
    makeRequest(),
    makeAdapters({
      readFirestoreScores: async () => [
        {
          docId: "player-1",
          prismaPlayerId: "player-1",
          prismaEntryId: "wrong-entry",
          checksum: "checksum"
        }
      ]
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 500);
  assert.match(String(json.error), /mismatched Prisma entry ID/);
});

test("duplicate player IDs are rejected before Firestore writes", async () => {
  let writes = 0;
  const response = await handleScoreMirrorPublishRequest(
    makeRequest(),
    makeAdapters({
      readActivePrismaRoundScores: async () => makeRound({ entries: [makeEntry(), makeEntry({ id: "entry-2" })] }),
      writeScoreMirror: async () => {
        writes += 1;
        return 1;
      }
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 500);
  assert.equal(writes, 0);
  assert.match(String(json.error), /Duplicate score entry player ID/);
});

test("lock blocks overlapping publish requests", async () => {
  const response = await handleScoreMirrorPublishRequest(
    makeRequest(),
    makeAdapters({
      acquireScoreMirrorPublishLock: async () => {
        throw Object.assign(new Error("Score mirror publish is already running."), {
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
  const response = await handleScoreMirrorPublishRequest(
    makeRequest(),
    makeAdapters({
      acquireScoreMirrorPublishLock: async () => async () => {
        released = true;
      },
      writeScoreMirror: async () => 2
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  assert.equal(released, true);
});

test("batch failure returns writesApplied zero", async () => {
  const response = await handleScoreMirrorPublishRequest(
    makeRequest(),
    makeAdapters({
      writeScoreMirror: async () => {
        throw new Error("batch failed");
      }
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 500);
  assert.equal(json.ok, false);
  assert.equal(json.writesPlanned, 2);
  assert.equal(json.writesApplied, 0);
  assert.match(String(json.error), /batch failed/);
});

test("publish writes only created and updated score mirror docs", async () => {
  const round = makeRound();
  const expected = mapPrismaScoresToFirebaseMirror(round);
  const unchanged = expected.scores.find((score) => score.prismaPlayerId === "player-1")!;
  let written: ScoreMirrorPublishWriteInput | null = null;
  const response = await handleScoreMirrorPublishRequest(
    makeRequest(),
    makeAdapters({
      readActivePrismaRoundScores: async () => round,
      readFirestoreScores: async () => [
        {
          docId: "player-1",
          prismaPlayerId: "player-1",
          prismaEntryId: unchanged.prismaEntryId,
          checksum: unchanged.checksum
        },
        {
          docId: "player-2",
          prismaPlayerId: "player-2",
          prismaEntryId: "entry-2",
          checksum: "old-score-checksum"
        }
      ],
      writeScoreMirror: async (_clubId, _roundId, input) => {
        written = input;
        return 1;
      }
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(json.writesPlanned, 1);
  assert.equal(json.writesApplied, 1);
  assert.ok(written);
  const writtenInput = written as ScoreMirrorPublishWriteInput;
  assert.deepEqual(writtenInput.scores.map((score) => score.prismaPlayerId), ["player-2"]);
  assert.equal(writtenInput.operationId, "operation-1");
});

test("only score mirror fields are written and derived result fields are excluded", async () => {
  let written: ScoreMirrorPublishWriteInput | null = null;
  const response = await handleScoreMirrorPublishRequest(
    makeRequest(),
    makeAdapters({
      writeScoreMirror: async (_clubId, _roundId, input) => {
        written = input;
        return 2;
      }
    })
  );
  const json = await readJson(response);
  const score = (written as ScoreMirrorPublishWriteInput | null)?.scores[0];
  const keys = Object.keys(score ?? {}).sort();
  const payloadText = JSON.stringify(written);

  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  assert.deepEqual(keys, [
    "backSubmittedAt",
    "birdieHoles",
    "checksum",
    "frontSubmittedAt",
    "holes",
    "prismaEntryId",
    "prismaPlayerId",
    "prismaRoundId",
    "quickBackNine",
    "quickFrontNine",
    "roundMode",
    "scoreVersion",
    "scoringEntryMode",
    "source"
  ]);

  for (const blocked of [
    "frontQuota",
    "backQuota",
    "frontNine",
    "backNine",
    "totalPoints",
    "plusMinus",
    "nextQuota",
    "rank",
    "payout",
    "settlement"
  ]) {
    assert.equal(payloadText.includes(blocked), false, `${blocked} should not be written`);
  }
});

test("derived score result fields in Prisma input are rejected before write", async () => {
  let writes = 0;
  const response = await handleScoreMirrorPublishRequest(
    makeRequest(),
    makeAdapters({
      readActivePrismaRoundScores: async () =>
        makeRound({
          entries: [
            {
              ...makeEntry(),
              plusMinus: 4
            } as unknown as PrismaScoreMirrorEntryInput
          ]
        }),
      writeScoreMirror: async () => {
        writes += 1;
        return 1;
      }
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 500);
  assert.equal(writes, 0);
  assert.match(String(json.error), /derived result field plusMinus/);
});

test("invalid score mode, hole values, and birdie-hole inputs return JSON errors", async () => {
  const invalidMode = await handleScoreMirrorPublishRequest(
    makeRequest(),
    makeAdapters({ readActivePrismaRoundScores: async () => makeRound({ scoringEntryMode: "OTHER" }) })
  );
  const invalidHole = await handleScoreMirrorPublishRequest(
    makeRequest(),
    makeAdapters({ readActivePrismaRoundScores: async () => makeRound({ entries: [makeEntry({ hole1: 3 })] }) })
  );
  const invalidBirdie = await handleScoreMirrorPublishRequest(
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

test("idempotent second publish has no writes to apply", async () => {
  const round = makeRound();
  const expected = mapPrismaScoresToFirebaseMirror(round);
  let writes = 0;
  const response = await handleScoreMirrorPublishRequest(
    makeRequest(),
    makeAdapters({
      readActivePrismaRoundScores: async () => round,
      readFirestoreScores: async () =>
        expected.scores.map((score) => ({
          docId: score.prismaPlayerId,
          prismaEntryId: score.prismaEntryId,
          prismaPlayerId: score.prismaPlayerId,
          playerName: expected.playerNamesById[score.prismaPlayerId],
          checksum: score.checksum
        })),
      writeScoreMirror: async (_clubId, _roundId, input) => {
        writes += input.scores.length;
        return writes;
      }
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(writes, 0);
  assert.deepEqual(json.scores.counts, { created: 0, updated: 0, unchanged: 2, extra: 0 });
  assert.equal(json.writesPlanned, 0);
  assert.equal(json.writesApplied, 0);
});

test("publish does not mutate Prisma input data", async () => {
  const prismaRound = makeRound();
  const snapshot = structuredClone(prismaRound);
  const response = await handleScoreMirrorPublishRequest(
    makeRequest(),
    makeAdapters({
      readActivePrismaRoundScores: async () => prismaRound,
      writeScoreMirror: async () => 2
    })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(prismaRound, snapshot);
});

test("malformed request fields return JSON errors", async () => {
  const response = await handleScoreMirrorPublishRequest(
    makeRequest({
      clubId: "",
      expectedProjectId: IREM_FIREBASE_PROJECT_ID,
      expectedPrismaRoundId: "round-1",
      confirmPublish: true
    }),
    makeAdapters()
  );
  const json = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(json.ok, false);
  assert.match(String(json.error), /clubId/);
});
