import test from "node:test";
import assert from "node:assert/strict";
import {
  handleActiveRoundPreparationRepairRequest,
  type ActiveRoundPreparationRepairAdapters
} from "@/lib/firebase/active-round-preparation-route";
import { IREM_FIREBASE_CLUB_ID } from "@/lib/firebase/active-round-preparation";
import { IREM_FIREBASE_PROJECT_ID } from "@/lib/firebase/player-mirror-seed";
import type { ActiveRoundPreparationAdapters } from "@/lib/firebase/active-round-preparation";
import type { PrismaRoundMirrorInput } from "@/lib/firebase/round-mirror";
import type { PrismaScoreMirrorRoundInput } from "@/lib/firebase/score-mirror";

const CREATED_AT = new Date("2026-07-18T12:00:00.000Z");

function makeRound(): PrismaRoundMirrorInput {
  return {
    id: "round-1",
    roundName: "Round",
    roundDate: CREATED_AT,
    roundMode: "MATCH_QUOTA",
    scoringEntryMode: "QUICK",
    isTestRound: false,
    teamCount: 2,
    notes: null,
    createdAt: CREATED_AT,
    lockedAt: CREATED_AT,
    startedAt: CREATED_AT,
    entries: [
      {
        id: "entry-1",
        playerId: "player-1",
        playerName: "Gary Neupauer",
        startQuota: 10,
        team: "A",
        groupNumber: 1,
        teeTime: "9:00 AM"
      }
    ]
  };
}

function makeScoreRound(): PrismaScoreMirrorRoundInput {
  return {
    id: "round-1",
    roundMode: "MATCH_QUOTA",
    scoringEntryMode: "QUICK",
    entries: [
      {
        id: "entry-1",
        playerId: "player-1",
        playerName: "Gary Neupauer",
        quickFrontNine: null,
        quickBackNine: null,
        frontSubmittedAt: null,
        backSubmittedAt: null,
        birdieHolesCsv: "",
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
        hole18: null
      }
    ]
  };
}

function makeRequest(token = "valid-token", body: unknown = {
  clubId: IREM_FIREBASE_CLUB_ID,
  expectedProjectId: IREM_FIREBASE_PROJECT_ID
}) {
  return new Request("http://localhost/api/firebase/active-round-preparation/repair", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
}

function makeAdapters(
  overrides: Partial<ActiveRoundPreparationRepairAdapters> = {}
): ActiveRoundPreparationRepairAdapters {
  const base: ActiveRoundPreparationAdapters = {
    readActivePrismaRoundSetup: async () => makeRound(),
    readActivePrismaRoundScores: async () => makeScoreRound(),
    readFirestoreRound: async () => null,
    readFirestoreRoundEntries: async () => [],
    readFirestoreActivePointer: async () => null,
    readFirestoreScores: async () => [],
    acquirePreparationLock: async () => async () => undefined,
    writePreparationBatch: async (_clubId, _roundId, input) =>
      (input.round ? 1 : 0) +
      input.entries.length +
      (input.activePointer ? 1 : 0) +
      input.scoresToCreate.length +
      1,
    createOperationId: () => "operation-1"
  };

  return {
    verifyIdToken: async (idToken) => {
      if (idToken !== "valid-token") {
        throw Object.assign(new Error("Invalid Firebase ID token."), { status: 401 });
      }
      return { uid: "uid-1" };
    },
    verifyClub: async (clubId) => ({ id: clubId, name: "Irem" }),
    readClubMembership: async () => ({ role: "owner", status: "active" }),
    ...base,
    ...overrides
  };
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, any>;
}

test("repair requires authentication", async () => {
  const response = await handleActiveRoundPreparationRepairRequest(makeRequest(""), makeAdapters());
  assert.equal(response.status, 401);
  assert.equal((await readJson(response)).ok, false);
});

test("repair rejects non-owner/admin roles", async () => {
  for (const role of ["member", "scorekeeper"] as const) {
    const response = await handleActiveRoundPreparationRepairRequest(
      makeRequest(),
      makeAdapters({ readClubMembership: async () => ({ role, status: "active" }) })
    );
    assert.equal(response.status, 403);
  }
});

test("repair rejects inactive and non-member users", async () => {
  const inactive = await handleActiveRoundPreparationRepairRequest(
    makeRequest(),
    makeAdapters({ readClubMembership: async () => ({ role: "owner", status: "removed" }) })
  );
  const missing = await handleActiveRoundPreparationRepairRequest(
    makeRequest(),
    makeAdapters({ readClubMembership: async () => null })
  );

  assert.equal(inactive.status, 403);
  assert.equal(missing.status, 403);
});

test("owner and admin can repair the active round without supplying a round ID", async () => {
  for (const role of ["owner", "admin"] as const) {
    const response = await handleActiveRoundPreparationRepairRequest(
      makeRequest(),
      makeAdapters({ readClubMembership: async () => ({ role, status: "active" }) })
    );
    const json = await readJson(response);

    assert.equal(response.status, 200);
    assert.equal(json.ok, true);
    assert.equal(json.roundId, "round-1");
    assert.equal(json.writesApplied, 5);
  }
});

test("wrong project and wrong club are rejected", async () => {
  const wrongProject = await handleActiveRoundPreparationRepairRequest(
    makeRequest("valid-token", { clubId: IREM_FIREBASE_CLUB_ID, expectedProjectId: "wrong" }),
    makeAdapters()
  );
  const wrongClub = await handleActiveRoundPreparationRepairRequest(
    makeRequest("valid-token", { clubId: "wrong-club", expectedProjectId: IREM_FIREBASE_PROJECT_ID }),
    makeAdapters()
  );

  assert.equal(wrongProject.status, 400);
  assert.equal(wrongClub.status, 400);
});

test("no active round returns a safe JSON error", async () => {
  const response = await handleActiveRoundPreparationRepairRequest(
    makeRequest(),
    makeAdapters({ readActivePrismaRoundSetup: async () => null })
  );
  const json = await readJson(response);

  assert.equal(response.status, 409);
  assert.equal(json.writesApplied, 0);
  assert.match(String(json.error), /No active Prisma round/);
});
