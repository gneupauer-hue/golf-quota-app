import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildScoreMirrorPublishRequestBody,
  buildScoreMirrorDryRunRequestBody,
  canPublishScoreMirror,
  shouldShowScoreMirrorValidationControls,
  isActiveOwnerOrAdminMembership
} from "@/components/firebase-account-panel";
import type { FirebaseUserClubMembership } from "@/lib/firebase/types";

const ACCOUNT_PANEL_SOURCE = readFileSync("components/firebase-account-panel.tsx", "utf8");

function membership(overrides: Partial<FirebaseUserClubMembership> = {}): FirebaseUserClubMembership {
  return {
    uid: "uid-1",
    email: "owner@example.com",
    displayName: "Owner",
    role: "owner",
    status: "active",
    clubId: "eO5PwRmRZrQJW0VbEp0B",
    clubName: "Irem Golf Quota",
    ...overrides
  };
}

test("score mirror dry-run control is visible only to active owner or admin memberships", () => {
  assert.equal(isActiveOwnerOrAdminMembership(membership({ role: "owner" }), "eO5PwRmRZrQJW0VbEp0B"), true);
  assert.equal(isActiveOwnerOrAdminMembership(membership({ role: "admin" }), "eO5PwRmRZrQJW0VbEp0B"), true);
  assert.equal(
    isActiveOwnerOrAdminMembership(membership({ role: "scorekeeper" }), "eO5PwRmRZrQJW0VbEp0B"),
    false
  );
  assert.equal(isActiveOwnerOrAdminMembership(membership({ role: "member" }), "eO5PwRmRZrQJW0VbEp0B"), false);
  assert.equal(isActiveOwnerOrAdminMembership(membership({ status: "removed" }), "eO5PwRmRZrQJW0VbEp0B"), false);
  assert.equal(isActiveOwnerOrAdminMembership(membership({ clubId: "other-club" }), "eO5PwRmRZrQJW0VbEp0B"), false);
});

test("score mirror publish card follows owner/admin visibility rules", () => {
  assert.equal(
    shouldShowScoreMirrorValidationControls({ signedIn: true, membership: membership({ role: "owner" }) }),
    true
  );
  assert.equal(
    shouldShowScoreMirrorValidationControls({ signedIn: true, membership: membership({ role: "admin" }) }),
    true
  );
  assert.equal(
    shouldShowScoreMirrorValidationControls({ signedIn: true, membership: membership({ role: "member" }) }),
    false
  );
  assert.equal(
    shouldShowScoreMirrorValidationControls({ signedIn: true, membership: membership({ role: "scorekeeper" }) }),
    false
  );
  assert.equal(
    shouldShowScoreMirrorValidationControls({ signedIn: true, membership: membership({ status: "removed" }) }),
    false
  );
  assert.equal(
    shouldShowScoreMirrorValidationControls({ signedIn: false, membership: membership({ role: "owner" }) }),
    false
  );
  assert.equal(
    shouldShowScoreMirrorValidationControls({ signedIn: true, membership: null }),
    false
  );
});

test("score mirror dry-run request body is read-only and pinned to the Irem club", () => {
  assert.deepEqual(buildScoreMirrorDryRunRequestBody(), {
    clubId: "eO5PwRmRZrQJW0VbEp0B",
    expectedProjectId: "irem-golf-quota-app",
    expectedPrismaRoundId: null
  });
});

test("score mirror publish is disabled until a clean active-round dry-run is confirmed", () => {
  const activeDryRun = {
    ok: true,
    status: "active-round",
    prismaRoundId: "round-1",
    scores: {
      counts: { created: 2, updated: 0, unchanged: 0, extra: 0 }
    }
  };

  assert.equal(
    canPublishScoreMirror({ confirmed: true, dryRunResult: null, isBusy: false }),
    false
  );
  assert.equal(
    canPublishScoreMirror({
      confirmed: true,
      dryRunResult: { ok: true, status: "no-active-round", prismaRoundId: null },
      isBusy: false
    }),
    false
  );
  assert.equal(
    canPublishScoreMirror({
      confirmed: true,
      dryRunResult: {
        ok: true,
        status: "active-round",
        prismaRoundId: "round-1",
        scores: { counts: { extra: 1 } }
      },
      isBusy: false
    }),
    false
  );
  assert.equal(
    canPublishScoreMirror({ confirmed: false, dryRunResult: activeDryRun, isBusy: false }),
    false
  );
  assert.equal(
    canPublishScoreMirror({ confirmed: true, dryRunResult: activeDryRun, isBusy: true }),
    false
  );
  assert.equal(
    canPublishScoreMirror({
      confirmed: true,
      dryRunError: "Dry-run failed.",
      dryRunResult: activeDryRun,
      isBusy: false
    }),
    false
  );
  assert.equal(
    canPublishScoreMirror({ confirmed: true, dryRunResult: activeDryRun, isBusy: false }),
    true
  );
});

test("score mirror publish request uses the exact latest dry-run round ID", () => {
  assert.deepEqual(
    buildScoreMirrorPublishRequestBody({
      ok: true,
      status: "active-round",
      prismaRoundId: "round-123",
      scores: { counts: { extra: 0 } }
    }),
    {
      clubId: "eO5PwRmRZrQJW0VbEp0B",
      expectedProjectId: "irem-golf-quota-app",
      expectedPrismaRoundId: "round-123",
      confirmPublish: true
    }
  );

  assert.throws(
    () => buildScoreMirrorPublishRequestBody({ ok: true, status: "no-active-round", prismaRoundId: null }),
    /active round/
  );
});

test("score mirror publish has no manual round override or Phase 4F scoring behavior", () => {
  const requestBody = buildScoreMirrorPublishRequestBody({
    ok: true,
    status: "active-round",
    prismaRoundId: "round-from-dry-run",
    scores: { counts: { extra: 0 } }
  });
  const payloadText = JSON.stringify(requestBody);

  assert.equal(payloadText.includes("autosave"), false);
  assert.equal(payloadText.includes("listener"), false);
  assert.equal(payloadText.includes("scoreEntry"), false);
  assert.equal(payloadText.includes("manualRoundId"), false);
  assert.equal(requestBody.expectedPrismaRoundId, "round-from-dry-run");
});

test("score mirror publish UI clears confirmation on new dry-run and publish completion", () => {
  const newDryRunReset = ACCOUNT_PANEL_SOURCE.indexOf("function runScoreMirrorDryRun");
  const publishReset = ACCOUNT_PANEL_SOURCE.indexOf("function publishScoreMirror");

  assert.notEqual(newDryRunReset, -1);
  assert.notEqual(publishReset, -1);
  assert.notEqual(
    ACCOUNT_PANEL_SOURCE.indexOf("setScoreMirrorPublishConfirm(false);", newDryRunReset),
    -1,
    "new dry-run should clear the publish confirmation"
  );
  assert.notEqual(
    ACCOUNT_PANEL_SOURCE.indexOf("setScoreMirrorPublishConfirm(false);", publishReset),
    -1,
    "publish completion or failure should clear the publish confirmation"
  );
});

test("score mirror publish UI shows errors and cannot write in no-active-round state", () => {
  assert.notEqual(ACCOUNT_PANEL_SOURCE.indexOf("scoreMirrorPublishError"), -1);
  assert.notEqual(ACCOUNT_PANEL_SOURCE.indexOf("/api/firebase/score-mirror/publish"), -1);
  assert.equal(
    canPublishScoreMirror({
      confirmed: true,
      dryRunResult: {
        ok: true,
        status: "no-active-round",
        prismaRoundId: null,
        scores: { counts: { created: 0, updated: 0, unchanged: 0, extra: 0 } }
      },
      isBusy: false
    }),
    false
  );
});
