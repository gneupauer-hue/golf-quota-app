import test from "node:test";
import assert from "node:assert/strict";
import { assertCanEnterScores } from "@/lib/firebase/score-access";

function adapters(overrides: {
  verified?: { uid: string } | null;
  membership?: { status?: string; role?: string } | null;
}) {
  return {
    verifySessionCookie: async () => overrides.verified ?? null,
    readMembership: async () => overrides.membership ?? null
  };
}

async function statusFor(promise: Promise<unknown>) {
  try {
    await promise;
    return 200;
  } catch (error) {
    return error && typeof error === "object" && "status" in error ? (error as { status: number }).status : 500;
  }
}

test("approved active member is allowed and uid is returned", async () => {
  const result = await assertCanEnterScores({
    clubId: "club-abc",
    sessionCookie: "cookie",
    adapters: adapters({ verified: { uid: "uid-1" }, membership: { status: "active", role: "member" } })
  });
  assert.equal(result.uid, "uid-1");
});

test("owner is always allowed", async () => {
  const result = await assertCanEnterScores({
    clubId: "club-abc",
    sessionCookie: "cookie",
    adapters: adapters({ verified: { uid: "owner" }, membership: { status: "active", role: "owner" } })
  });
  assert.equal(result.uid, "owner");
});

test("missing session cookie is denied (401)", async () => {
  const status = await statusFor(
    assertCanEnterScores({ clubId: "club-abc", sessionCookie: undefined, adapters: adapters({}) })
  );
  assert.equal(status, 401);
});

test("expired/invalid session is denied (401)", async () => {
  const status = await statusFor(
    assertCanEnterScores({ clubId: "club-abc", sessionCookie: "bad", adapters: adapters({ verified: null }) })
  );
  assert.equal(status, 401);
});

test("signed-in but not-yet-approved (requested) is denied (403)", async () => {
  const status = await statusFor(
    assertCanEnterScores({
      clubId: "club-abc",
      sessionCookie: "cookie",
      adapters: adapters({ verified: { uid: "uid-2" }, membership: { status: "requested", role: "member" } })
    })
  );
  assert.equal(status, 403);
});

test("signed-in but no membership at all is denied (403)", async () => {
  const status = await statusFor(
    assertCanEnterScores({
      clubId: "club-abc",
      sessionCookie: "cookie",
      adapters: adapters({ verified: { uid: "stranger" }, membership: null })
    })
  );
  assert.equal(status, 403);
});
