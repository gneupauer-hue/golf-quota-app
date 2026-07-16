import assert from "node:assert/strict";
import test from "node:test";
import { buildRoundMirrorDryRunRequestBody } from "@/components/firebase-account-panel";

test("round mirror dry-run body uses the active Prisma round ID", () => {
  assert.deepEqual(buildRoundMirrorDryRunRequestBody("round-123"), {
    clubId: "eO5PwRmRZrQJW0VbEp0B",
    expectedProjectId: "irem-golf-quota-app",
    expectedPrismaRoundId: "round-123"
  });
});

test("round mirror dry-run body still supports no-active-round validation", () => {
  assert.deepEqual(buildRoundMirrorDryRunRequestBody(null), {
    clubId: "eO5PwRmRZrQJW0VbEp0B",
    expectedProjectId: "irem-golf-quota-app",
    expectedPrismaRoundId: null
  });
});
