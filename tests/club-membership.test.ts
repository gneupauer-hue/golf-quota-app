import test from "node:test";
import assert from "node:assert/strict";
import {
  assertCanApproveMembers,
  buildMembershipApproval,
  buildPendingMembershipDocs,
  canMemberEnterScores,
  normalizeMembershipRequest
} from "@/lib/firebase/club-membership";

test("normalizeMembershipRequest trims the name and defaults consent to false", () => {
  const result = normalizeMembershipRequest({ fullName: "  Bob   Lipski " });
  assert.equal(result.fullName, "Bob Lipski");
  assert.equal(result.gameTextConsent, false);
});

test("normalizeMembershipRequest keeps explicit consent", () => {
  const result = normalizeMembershipRequest({ fullName: "Bob Lipski", gameTextConsent: true });
  assert.equal(result.gameTextConsent, true);
});

test("normalizeMembershipRequest rejects an empty or too-short name", () => {
  assert.throws(() => normalizeMembershipRequest({ fullName: " " }), /full name/i);
  assert.throws(() => normalizeMembershipRequest({ fullName: "B" }), /full name/i);
});

test("buildPendingMembershipDocs starts requested, member role, not scoring-eligible", () => {
  const { member, userMembership } = buildPendingMembershipDocs({
    uid: "uid-123",
    clubId: "club-abc",
    clubName: "Irem Golf Quota",
    fullName: "Bob Lipski",
    phoneNumber: "+15705551234",
    email: null,
    gameTextConsent: true,
    now: "NOW"
  });

  assert.equal(member.status, "requested");
  assert.equal(member.role, "member");
  assert.equal(member.displayName, "Bob Lipski");
  assert.equal(member.phoneNumber, "+15705551234");
  assert.equal(member.gameTextConsent, true);
  assert.equal(member.linkedPlayerId, null);
  assert.equal(userMembership.clubId, "club-abc");
  assert.equal(userMembership.clubName, "Irem Golf Quota");
  // A pending request must never be able to score.
  assert.equal(canMemberEnterScores(member), false);
});

test("buildMembershipApproval activates and links a roster player", () => {
  const approval = buildMembershipApproval({
    approvedByUid: "owner-uid",
    linkedPlayerId: "  player-77  ",
    now: "NOW"
  });

  assert.equal(approval.status, "active");
  assert.equal(approval.role, "member");
  assert.equal(approval.linkedPlayerId, "player-77");
  assert.equal(approval.approvedByUid, "owner-uid");
});

test("canMemberEnterScores only passes for active scoring roles", () => {
  assert.equal(canMemberEnterScores({ status: "active", role: "member" }), true);
  assert.equal(canMemberEnterScores({ status: "active", role: "owner" }), true);
  assert.equal(canMemberEnterScores({ status: "requested", role: "member" }), false);
  assert.equal(canMemberEnterScores({ status: "removed", role: "member" }), false);
  assert.equal(canMemberEnterScores(null), false);
});

test("assertCanApproveMembers allows owners/admins and blocks everyone else", () => {
  assert.doesNotThrow(() => assertCanApproveMembers({ status: "active", role: "owner" }));
  assert.doesNotThrow(() => assertCanApproveMembers({ status: "active", role: "admin" }));
  assert.throws(() => assertCanApproveMembers({ status: "active", role: "member" }), /owners and admins/i);
  assert.throws(() => assertCanApproveMembers({ status: "requested", role: "owner" }), /not active/i);
  assert.throws(() => assertCanApproveMembers(null), /not a member/i);
});
