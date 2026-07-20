import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildRoundMirrorDryRunRequestBody,
  buildRoundMirrorPublishRequestBody,
  buildScoreMirrorPublishRequestBody,
  buildScoreMirrorDryRunRequestBody,
  canPublishRoundMirror,
  canPublishScoreMirror,
  shouldShowScoreMirrorValidationControls,
  isActiveOwnerOrAdminMembership
} from "@/components/firebase-account-panel";
import type { FirebaseUserClubMembership } from "@/lib/firebase/types";

const ACCOUNT_PANEL_SOURCE = readFileSync("components/firebase-account-panel.tsx", "utf8");
const ACCOUNT_PAGE_SOURCE = readFileSync("app/account/page.tsx", "utf8");

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

test("score mirror dry-run request body uses the active Prisma round ID", () => {
  assert.deepEqual(buildScoreMirrorDryRunRequestBody("active-round-1"), {
    clubId: "eO5PwRmRZrQJW0VbEp0B",
    expectedProjectId: "irem-golf-quota-app",
    expectedPrismaRoundId: "active-round-1"
  });
});

test("round shell dry-run request uses the active Prisma round ID from the page", () => {
  assert.deepEqual(buildRoundMirrorDryRunRequestBody("active-round-1"), {
    clubId: "eO5PwRmRZrQJW0VbEp0B",
    expectedProjectId: "irem-golf-quota-app",
    expectedPrismaRoundId: "active-round-1"
  });

  assert.notEqual(ACCOUNT_PAGE_SOURCE.indexOf("selectActivePrismaRoundSetup"), -1);
  assert.notEqual(ACCOUNT_PAGE_SOURCE.indexOf("activePrismaRoundId={activePrismaRoundId}"), -1);
});

test("round shell publish is disabled until a clean active-round dry-run is confirmed", () => {
  const cleanDryRun = {
    ok: true,
    mode: "dry-run" as const,
    status: "locked",
    prismaRoundId: "round-1",
    round: { counts: { created: 1, updated: 0, unchanged: 0, extra: 0 } },
    entries: { counts: { created: 4, updated: 0, unchanged: 0, extra: 0 } },
    activePointer: { counts: { created: 1, updated: 0, unchanged: 0, extra: 0 } }
  };

  assert.equal(
    canPublishRoundMirror({
      activePrismaRoundId: "round-1",
      confirmed: true,
      dryRunResult: null,
      isBusy: false
    }),
    false
  );
  assert.equal(
    canPublishRoundMirror({
      activePrismaRoundId: null,
      confirmed: true,
      dryRunResult: cleanDryRun,
      isBusy: false
    }),
    false
  );
  assert.equal(
    canPublishRoundMirror({
      activePrismaRoundId: "other-round",
      confirmed: true,
      dryRunResult: cleanDryRun,
      isBusy: false
    }),
    false
  );
  assert.equal(
    canPublishRoundMirror({
      activePrismaRoundId: "round-1",
      confirmed: false,
      dryRunResult: cleanDryRun,
      isBusy: false
    }),
    false
  );
  assert.equal(
    canPublishRoundMirror({
      activePrismaRoundId: "round-1",
      confirmed: true,
      dryRunError: "Dry-run failed.",
      dryRunResult: cleanDryRun,
      isBusy: false
    }),
    false
  );
  assert.equal(
    canPublishRoundMirror({
      activePrismaRoundId: "round-1",
      confirmed: true,
      dryRunResult: {
        ...cleanDryRun,
        entries: { counts: { created: 0, updated: 0, unchanged: 4, extra: 1 } }
      },
      isBusy: false
    }),
    false
  );
  assert.equal(
    canPublishRoundMirror({
      activePrismaRoundId: "round-1",
      confirmed: true,
      dryRunResult: cleanDryRun,
      isBusy: true
    }),
    false
  );
  assert.equal(
    canPublishRoundMirror({
      activePrismaRoundId: "round-1",
      confirmed: true,
      dryRunResult: cleanDryRun,
      isBusy: false
    }),
    true
  );
});

test("round shell publish request uses only the active dry-run round ID", () => {
  assert.deepEqual(
    buildRoundMirrorPublishRequestBody({
      activePrismaRoundId: "round-1",
      dryRunResult: {
        ok: true,
        mode: "dry-run",
        status: "locked",
        prismaRoundId: "round-1"
      }
    }),
    {
      clubId: "eO5PwRmRZrQJW0VbEp0B",
      expectedProjectId: "irem-golf-quota-app",
      expectedPrismaRoundId: "round-1",
      confirmPublish: true
    }
  );

  assert.throws(
    () =>
      buildRoundMirrorPublishRequestBody({
        activePrismaRoundId: "round-1",
        dryRunResult: {
          ok: true,
          mode: "dry-run",
          status: "locked",
          prismaRoundId: "other-round"
        }
      }),
    /active round/
  );
});

test("round shell control reuses round mirror APIs and has no manual ID entry", () => {
  assert.notEqual(ACCOUNT_PANEL_SOURCE.indexOf("/api/firebase/round-mirror/dry-run"), -1);
  assert.notEqual(ACCOUNT_PANEL_SOURCE.indexOf("/api/firebase/round-mirror/publish"), -1);
  assert.notEqual(ACCOUNT_PANEL_SOURCE.indexOf("Run Round Shell Dry-Run"), -1);
  assert.notEqual(ACCOUNT_PANEL_SOURCE.indexOf("Publish Round Shell"), -1);
  assert.equal(ACCOUNT_PANEL_SOURCE.includes("manualRoundId"), false);
  assert.equal(ACCOUNT_PANEL_SOURCE.includes("setManualRound"), false);
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
