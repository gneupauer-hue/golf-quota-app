import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRoundMirrorClearRequestBody,
  buildRoundMirrorDryRunRequestBody,
  buildRoundMirrorPublishRequestBody,
  canPublishRoundMirrorFromDryRun
} from "@/components/firebase-account-panel";

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

test("round mirror publish body is hard-confirmed for the validation round", () => {
  assert.deepEqual(buildRoundMirrorPublishRequestBody("cmrnk4tga0000jk04pji9u7ft"), {
    clubId: "eO5PwRmRZrQJW0VbEp0B",
    expectedProjectId: "irem-golf-quota-app",
    expectedPrismaRoundId: "cmrnk4tga0000jk04pji9u7ft",
    confirmPublish: true
  });
});

test("round mirror clear body is hard-confirmed for the mirrored test round", () => {
  assert.deepEqual(buildRoundMirrorClearRequestBody("cmrnk4tga0000jk04pji9u7ft"), {
    clubId: "eO5PwRmRZrQJW0VbEp0B",
    expectedProjectId: "irem-golf-quota-app",
    expectedFirestoreRoundId: "cmrnk4tga0000jk04pji9u7ft",
    confirmClear: true
  });
});

test("round mirror publish requires the exact clean production dry-run audit", () => {
  assert.equal(
    canPublishRoundMirrorFromDryRun(
      {
        status: "locked",
        prismaRoundId: "cmrnk4tga0000jk04pji9u7ft",
        round: { counts: { created: 1, updated: 0, unchanged: 0, extra: 0 } },
        entries: { counts: { created: 4, updated: 0, unchanged: 0, extra: 0 } },
        activePointer: { counts: { created: 1, updated: 0, unchanged: 0, extra: 0 } },
        writesPlanned: 0,
        writesApplied: 0
      },
      "cmrnk4tga0000jk04pji9u7ft"
    ),
    true
  );
});

test("round mirror publish is blocked for wrong round IDs, extras, errors, and unchanged audits", () => {
  const cleanAudit = {
    status: "locked",
    prismaRoundId: "cmrnk4tga0000jk04pji9u7ft",
    round: { counts: { created: 1, updated: 0, unchanged: 0, extra: 0 } },
    entries: { counts: { created: 4, updated: 0, unchanged: 0, extra: 0 } },
    activePointer: { counts: { created: 1, updated: 0, unchanged: 0, extra: 0 } },
    writesPlanned: 0,
    writesApplied: 0
  };

  assert.equal(canPublishRoundMirrorFromDryRun(cleanAudit, "other-round"), false);
  assert.equal(
    canPublishRoundMirrorFromDryRun(
      { ...cleanAudit, entries: { counts: { created: 4, updated: 0, unchanged: 0, extra: 1 } } },
      "cmrnk4tga0000jk04pji9u7ft"
    ),
    false
  );
  assert.equal(
    canPublishRoundMirrorFromDryRun({ ...cleanAudit, error: "Nope" }, "cmrnk4tga0000jk04pji9u7ft"),
    false
  );
  assert.equal(
    canPublishRoundMirrorFromDryRun(
      {
        ...cleanAudit,
        round: { counts: { created: 0, updated: 0, unchanged: 1, extra: 0 } },
        entries: { counts: { created: 0, updated: 0, unchanged: 4, extra: 0 } },
        activePointer: { counts: { created: 0, updated: 0, unchanged: 1, extra: 0 } }
      },
      "cmrnk4tga0000jk04pji9u7ft"
    ),
    false
  );
});
