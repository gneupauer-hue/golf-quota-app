import test from "node:test";
import assert from "node:assert/strict";
import { IREM_FIREBASE_PROJECT_ID } from "@/lib/firebase/player-mirror-seed";
import {
  handleMembershipApproval,
  handleMembershipRequest
} from "@/lib/firebase/membership-routes";

const CLUB_ID = "club-abc";

function makeRequest(body: Record<string, unknown>, options: { token?: string } = {}) {
  return new Request("https://example.com/api", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
    },
    body: JSON.stringify({ clubId: CLUB_ID, expectedProjectId: IREM_FIREBASE_PROJECT_ID, ...body })
  });
}

function baseRequestAdapters() {
  const writes: Array<{ uid: string; status: string; fullName: string | null }> = [];
  const notified: Array<{ fullName: string; phoneNumber: string | null }> = [];
  return {
    writes,
    notified,
    verifyIdToken: async () => ({ uid: "uid-new", phoneNumber: "+15705551234", email: null }),
    verifyClub: async () => ({ id: CLUB_ID, name: "Irem Golf Quota" }),
    readMembership: async () => null as { status?: string } | null,
    writePendingMembership: async (_clubId: string, uid: string, docs: { member: { status: string; displayName: string | null } }) => {
      writes.push({ uid, status: docs.member.status, fullName: docs.member.displayName });
    },
    onMembershipRequested: async (info: { fullName: string; phoneNumber: string | null }) => {
      notified.push(info);
    },
    now: () => "NOW"
  };
}

test("request: new phone user creates a requested membership", async () => {
  const adapters = baseRequestAdapters();
  const res = await handleMembershipRequest(makeRequest({ fullName: "Bob Lipski" }, { token: "t" }), adapters);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "requested");
  assert.equal(adapters.writes.length, 1);
  assert.equal(adapters.writes[0].status, "requested");
  assert.equal(adapters.writes[0].fullName, "Bob Lipski");
});

test("request: new request notifies the owner once with the name", async () => {
  const adapters = baseRequestAdapters();
  await handleMembershipRequest(makeRequest({ fullName: "Bob Lipski" }, { token: "t" }), adapters);
  assert.equal(adapters.notified.length, 1);
  assert.equal(adapters.notified[0].fullName, "Bob Lipski");
  assert.equal(adapters.notified[0].phoneNumber, "+15705551234");
});

test("request: an existing active member is left untouched and not notified", async () => {
  const adapters = baseRequestAdapters();
  adapters.readMembership = async () => ({ status: "active" });
  const res = await handleMembershipRequest(makeRequest({ fullName: "Bob Lipski" }, { token: "t" }), adapters);
  const data = await res.json();
  assert.equal(data.status, "already-member");
  assert.equal(adapters.writes.length, 0);
  assert.equal(adapters.notified.length, 0);
});

test("request: a failing notification never blocks the signup", async () => {
  const adapters = baseRequestAdapters();
  adapters.onMembershipRequested = async () => {
    throw new Error("email provider down");
  };
  const res = await handleMembershipRequest(makeRequest({ fullName: "Bob Lipski" }, { token: "t" }), adapters);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "requested");
  assert.equal(adapters.writes.length, 1);
});

test("request: missing name is rejected", async () => {
  const adapters = baseRequestAdapters();
  const res = await handleMembershipRequest(makeRequest({ fullName: "" }, { token: "t" }), adapters);
  assert.equal(res.status, 400);
  assert.equal(adapters.writes.length, 0);
});

test("request: no sign-in token is rejected", async () => {
  const adapters = baseRequestAdapters();
  const res = await handleMembershipRequest(makeRequest({ fullName: "Bob Lipski" }), adapters);
  assert.equal(res.status, 401);
});

function baseApprovalAdapters() {
  const approvals: Array<{ targetUid: string; status: string; role: string; linkedPlayerId: string | null }> = [];
  return {
    approvals,
    verifyIdToken: async () => ({ uid: "owner-uid" }),
    verifyClub: async () => ({ id: CLUB_ID, name: "Irem Golf Quota" }),
    readMembership: async () => ({ status: "active", role: "owner" }) as { status?: string; role?: string } | null,
    readTargetMembership: async () => ({ status: "requested", role: "member" }) as { status?: string; role?: string } | null,
    writeApproval: async (_clubId: string, targetUid: string, approval: { status: string; role: string; linkedPlayerId: string | null }) => {
      approvals.push({ targetUid, status: approval.status, role: approval.role, linkedPlayerId: approval.linkedPlayerId });
    },
    now: () => "NOW"
  };
}

test("approval: owner approves and links a roster player", async () => {
  const adapters = baseApprovalAdapters();
  const res = await handleMembershipApproval(
    makeRequest({ targetUid: "uid-new", linkedPlayerId: "player-77" }, { token: "t" }),
    adapters
  );
  assert.equal(res.status, 200);
  assert.equal(adapters.approvals.length, 1);
  assert.equal(adapters.approvals[0].status, "active");
  assert.equal(adapters.approvals[0].linkedPlayerId, "player-77");
});

test("approval: a non-owner member cannot approve", async () => {
  const adapters = baseApprovalAdapters();
  adapters.readMembership = async () => ({ status: "active", role: "member" });
  const res = await handleMembershipApproval(makeRequest({ targetUid: "uid-new" }, { token: "t" }), adapters);
  assert.equal(res.status, 403);
  assert.equal(adapters.approvals.length, 0);
});

test("approval: unknown target request returns 404", async () => {
  const adapters = baseApprovalAdapters();
  adapters.readTargetMembership = async () => null;
  const res = await handleMembershipApproval(makeRequest({ targetUid: "nope" }, { token: "t" }), adapters);
  assert.equal(res.status, 404);
});
