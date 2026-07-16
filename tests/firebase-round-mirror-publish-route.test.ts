import test from "node:test";
import assert from "node:assert/strict";
import {
  handleRoundMirrorPublishRequest,
  type RoundMirrorPublishMembership,
  type RoundMirrorPublishRouteAdapters,
  type RoundMirrorPublishWriteInput
} from "@/lib/firebase/round-mirror-publish-route";
import { IREM_FIREBASE_PROJECT_ID } from "@/lib/firebase/player-mirror-seed";
import {
  mapPrismaRoundToFirebaseMirror,
  type PrismaRoundMirrorInput
} from "@/lib/firebase/round-mirror";

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
    expectedPrismaRoundId: "round-1",
    confirmPublish: true
  },
  token = "valid-token"
) {
  return new Request("http://localhost/api/firebase/round-mirror/publish", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
}

function makeAdapters(
  overrides: Partial<RoundMirrorPublishRouteAdapters> = {}
): RoundMirrorPublishRouteAdapters {
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
    acquireRoundMirrorPublishLock: async () => async () => undefined,
    writeRoundMirror: async () => {
      throw new Error("Unexpected write.");
    },
    ...overrides
  };
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, any>;
}

test("unauthenticated requests are denied with JSON", async () => {
  const response = await handleRoundMirrorPublishRequest(makeRequest(undefined, ""), makeAdapters());
  const json = await readJson(response);

  assert.equal(response.status, 401);
  assert.equal(json.ok, false);
  assert.match(String(json.error), /Sign in/);
});

test("invalid tokens are denied with JSON", async () => {
  const response = await handleRoundMirrorPublishRequest(
    makeRequest(undefined, "bad-token"),
    makeAdapters()
  );
  const json = await readJson(response);

  assert.equal(response.status, 401);
  assert.equal(json.ok, false);
  assert.match(String(json.error), /Invalid Firebase ID token/);
});

test("non-member and inactive member are denied", async () => {
  const nonMember = await handleRoundMirrorPublishRequest(
    makeRequest(),
    makeAdapters({ readClubMembership: async () => null })
  );
  const inactive = await handleRoundMirrorPublishRequest(
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
    const membership: RoundMirrorPublishMembership = { role, status: "active" };
    const response = await handleRoundMirrorPublishRequest(
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
    const membership: RoundMirrorPublishMembership = { role, status: "active" };
    const writes: RoundMirrorPublishWriteInput[] = [];
    const response = await handleRoundMirrorPublishRequest(
      makeRequest(),
      makeAdapters({
        readClubMembership: async () => membership,
        writeRoundMirror: async (_clubId, _roundId, input) => {
          writes.push(input);
          return 4;
        }
      })
    );
    const json = await readJson(response);

    assert.equal(response.status, 200);
    assert.equal(json.ok, true);
    assert.equal(json.publishedRoundId, "round-1");
    assert.equal(json.writesApplied, 4);
    assert.equal(writes.length, 1);
  });
}

test("no active round is denied", async () => {
  let released = false;
  const response = await handleRoundMirrorPublishRequest(
    makeRequest(),
    makeAdapters({
      readActivePrismaRoundSetup: async () => null,
      acquireRoundMirrorPublishLock: async () => async () => {
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
  const response = await handleRoundMirrorPublishRequest(
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

test("publish requires confirmPublish", async () => {
  const response = await handleRoundMirrorPublishRequest(
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
  const response = await handleRoundMirrorPublishRequest(
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
  const response = await handleRoundMirrorPublishRequest(
    makeRequest(),
    makeAdapters({
      readFirestoreRoundEntries: async () => [
        { docId: "extra-player", prismaPlayerId: "extra-player", checksum: "extra-checksum" }
      ],
      writeRoundMirror: async () => {
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

test("lock blocks overlapping publish requests", async () => {
  const response = await handleRoundMirrorPublishRequest(
    makeRequest(),
    makeAdapters({
      acquireRoundMirrorPublishLock: async () => {
        throw Object.assign(new Error("Round mirror publish is already running."), {
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
  const response = await handleRoundMirrorPublishRequest(
    makeRequest(),
    makeAdapters({
      acquireRoundMirrorPublishLock: async () => async () => {
        released = true;
      },
      writeRoundMirror: async () => 4
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  assert.equal(released, true);
});

test("batch failure returns writesApplied zero", async () => {
  const response = await handleRoundMirrorPublishRequest(
    makeRequest(),
    makeAdapters({
      writeRoundMirror: async () => {
        throw new Error("batch failed");
      }
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 500);
  assert.equal(json.ok, false);
  assert.equal(json.writesPlanned, 4);
  assert.equal(json.writesApplied, 0);
  assert.match(String(json.error), /batch failed/);
});

test("publish writes only created and updated setup mirror docs", async () => {
  const round = makeRound();
  const expected = mapPrismaRoundToFirebaseMirror(round);
  const unchanged = expected.entries.find((entry) => entry.prismaPlayerId === "player-1")!;
  let written: RoundMirrorPublishWriteInput | null = null;
  const response = await handleRoundMirrorPublishRequest(
    makeRequest(),
    makeAdapters({
      readActivePrismaRoundSetup: async () => round,
      readFirestoreRound: async () => ({
        prismaRoundId: expected.round.prismaRoundId,
        checksum: expected.round.checksum
      }),
      readFirestoreRoundEntries: async () => [
        { docId: "player-1", prismaPlayerId: "player-1", checksum: unchanged.checksum },
        { docId: "player-2", prismaPlayerId: "player-2", checksum: "old-entry-checksum" }
      ],
      readFirestoreActivePointer: async () => ({
        roundId: expected.activePointer.roundId,
        prismaRoundId: expected.activePointer.prismaRoundId,
        checksum: "old-pointer-checksum"
      }),
      writeRoundMirror: async (_clubId, _roundId, input) => {
        written = input;
        return 2;
      }
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(json.writesPlanned, 2);
  assert.equal(json.writesApplied, 2);
  assert.ok(written);
  const writtenInput = written as RoundMirrorPublishWriteInput;
  assert.equal(writtenInput.round, undefined);
  assert.deepEqual(writtenInput.entries.map((entry) => entry.prismaPlayerId), ["player-2"]);
  assert.equal(writtenInput.activePointer?.roundId, "round-1");
});

test("score fields are excluded from publish writes", async () => {
  let written: RoundMirrorPublishWriteInput | null = null;
  const response = await handleRoundMirrorPublishRequest(
    makeRequest(),
    makeAdapters({
      writeRoundMirror: async (_clubId, _roundId, input) => {
        written = input;
        return 4;
      }
    })
  );
  const json = await readJson(response);
  const payloadText = JSON.stringify(written);

  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  for (const blocked of [
    "hole1",
    "hole18",
    "quickFrontNine",
    "quickBackNine",
    "birdieHolesCsv",
    "totalPoints",
    "nextQuota",
    "rank",
    "payout"
  ]) {
    assert.equal(payloadText.includes(blocked), false, `${blocked} should not be written`);
  }
});

test("score-shaped mapper input is rejected before write", async () => {
  let writes = 0;
  const response = await handleRoundMirrorPublishRequest(
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
        }),
      writeRoundMirror: async () => {
        writes += 1;
        return 1;
      }
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 500);
  assert.equal(writes, 0);
  assert.match(String(json.error), /must not include score field hole1/);
});

test("idempotent second publish has no writes to apply", async () => {
  const round = makeRound();
  const expected = mapPrismaRoundToFirebaseMirror(round);
  let writes = 0;
  const response = await handleRoundMirrorPublishRequest(
    makeRequest(),
    makeAdapters({
      readActivePrismaRoundSetup: async () => round,
      readFirestoreRound: async () => ({
        docId: expected.roundId,
        prismaRoundId: expected.round.prismaRoundId,
        checksum: expected.round.checksum
      }),
      readFirestoreRoundEntries: async () =>
        expected.entries.map((entry) => ({
          docId: entry.prismaPlayerId,
          prismaPlayerId: entry.prismaPlayerId,
          playerName: entry.playerName,
          checksum: entry.checksum
        })),
      readFirestoreActivePointer: async () => ({
        roundId: expected.activePointer.roundId,
        prismaRoundId: expected.activePointer.prismaRoundId,
        checksum: expected.activePointer.checksum
      }),
      writeRoundMirror: async (_clubId, _roundId, input) => {
        writes += (input.round ? 1 : 0) + input.entries.length + (input.activePointer ? 1 : 0);
        return writes;
      }
    })
  );
  const json = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(writes, 0);
  assert.deepEqual(json.round.counts, { created: 0, updated: 0, unchanged: 1, extra: 0 });
  assert.deepEqual(json.entries.counts, { created: 0, updated: 0, unchanged: 2, extra: 0 });
  assert.deepEqual(json.activePointer.counts, { created: 0, updated: 0, unchanged: 1, extra: 0 });
  assert.equal(json.writesPlanned, 0);
  assert.equal(json.writesApplied, 0);
});

test("malformed Firestore mirror docs are rejected before write", async () => {
  let writes = 0;
  const response = await handleRoundMirrorPublishRequest(
    makeRequest(),
    makeAdapters({
      readFirestoreRoundEntries: async () => [
        { docId: "player-1", prismaPlayerId: "player-1", checksum: "" }
      ],
      writeRoundMirror: async () => {
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

test("publish does not mutate Prisma input data", async () => {
  const prismaRound = makeRound();
  const snapshot = structuredClone(prismaRound);
  const response = await handleRoundMirrorPublishRequest(
    makeRequest(),
    makeAdapters({
      readActivePrismaRoundSetup: async () => prismaRound,
      writeRoundMirror: async () => 4
    })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(prismaRound, snapshot);
});

test("malformed request fields return JSON errors", async () => {
  const response = await handleRoundMirrorPublishRequest(
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
