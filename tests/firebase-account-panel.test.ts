import test from "node:test";
import assert from "node:assert/strict";
import {
  buildScoreMirrorDryRunRequestBody,
  isActiveOwnerOrAdminMembership
} from "@/components/firebase-account-panel";
import type { FirebaseUserClubMembership } from "@/lib/firebase/types";

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

test("score mirror dry-run request body is read-only and pinned to the Irem club", () => {
  assert.deepEqual(buildScoreMirrorDryRunRequestBody(), {
    clubId: "eO5PwRmRZrQJW0VbEp0B",
    expectedProjectId: "irem-golf-quota-app",
    expectedPrismaRoundId: null
  });
});
