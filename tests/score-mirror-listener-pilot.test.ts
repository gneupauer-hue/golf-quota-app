import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildScoreMirrorPilotSnapshotState,
  shouldShowScoreMirrorDiagnosticPanel,
  shouldSubscribeToScoreMirrorPilot
} from "@/components/score-mirror-listener-pilot";
import type { FirebaseUserClubMembership } from "@/lib/firebase/types";

const PILOT_SOURCE = readFileSync("components/score-mirror-listener-pilot.tsx", "utf8");

function membership(overrides: Partial<FirebaseUserClubMembership> = {}): FirebaseUserClubMembership {
  return {
    uid: "uid-1",
    email: "owner@example.com",
    displayName: "Owner",
    role: "member",
    status: "active",
    clubId: "club-1",
    clubName: "Irem Golf Quota",
    ...overrides
  };
}

test("score mirror pilot subscribes only for signed-in active members with a club and current round", () => {
  assert.equal(
    shouldSubscribeToScoreMirrorPilot({
      signedIn: true,
      activeClubId: "club-1",
      roundId: "round-1",
      membership: membership()
    }),
    true
  );
  assert.equal(
    shouldSubscribeToScoreMirrorPilot({
      signedIn: false,
      activeClubId: "club-1",
      roundId: "round-1",
      membership: membership()
    }),
    false
  );
  assert.equal(
    shouldSubscribeToScoreMirrorPilot({
      signedIn: true,
      activeClubId: "club-1",
      roundId: null,
      membership: membership()
    }),
    false
  );
  assert.equal(
    shouldSubscribeToScoreMirrorPilot({
      signedIn: true,
      activeClubId: "club-1",
      roundId: "round-1",
      membership: membership({ status: "removed" })
    }),
    false
  );
  assert.equal(
    shouldSubscribeToScoreMirrorPilot({
      signedIn: true,
      activeClubId: "club-1",
      roundId: "round-1",
      membership: membership({ clubId: "other-club" })
    }),
    false
  );
});

test("owner and admin see diagnostics while member and scorekeeper diagnostics stay hidden", () => {
  assert.equal(
    shouldShowScoreMirrorDiagnosticPanel({ signedIn: true, membership: membership({ role: "owner" }) }),
    true
  );
  assert.equal(
    shouldShowScoreMirrorDiagnosticPanel({ signedIn: true, membership: membership({ role: "admin" }) }),
    true
  );
  assert.equal(
    shouldShowScoreMirrorDiagnosticPanel({ signedIn: true, membership: membership({ role: "member" }) }),
    false
  );
  assert.equal(
    shouldShowScoreMirrorDiagnosticPanel({ signedIn: true, membership: membership({ role: "scorekeeper" }) }),
    false
  );
  assert.equal(
    shouldShowScoreMirrorDiagnosticPanel({ signedIn: true, membership: membership({ role: "owner", status: "removed" }) }),
    false
  );
  assert.equal(
    shouldShowScoreMirrorDiagnosticPanel({ signedIn: false, membership: membership({ role: "owner" }) }),
    false
  );
});

test("pilot snapshot state treats empty collections as connected", () => {
  const state = buildScoreMirrorPilotSnapshotState(
    "round-1",
    { scores: [], malformed: [] },
    "2026-07-18T18:00:00.000Z"
  );

  assert.equal(state.status, "connected");
  assert.equal(state.observedRoundId, "round-1");
  assert.equal(state.scoreDocumentCount, 0);
  assert.equal(state.malformedDocumentCount, 0);
  assert.equal(state.lastSnapshotAt, "2026-07-18T18:00:00.000Z");
});

test("pilot lifecycle clears stale state and unsubscribes on round, club, sign-out, and unmount changes", () => {
  assert.notEqual(PILOT_SOURCE.indexOf("setState(INITIAL_LISTENER_STATE);"), -1);
  assert.notEqual(PILOT_SOURCE.indexOf("latestSubscriptionKey.current = \"\";"), -1);
  assert.notEqual(PILOT_SOURCE.indexOf("unsubscribe();"), -1);
  assert.notEqual(PILOT_SOURCE.indexOf("[activeClubId, roundId, shouldSubscribe]"), -1);
});

test("pilot avoids duplicate rerender listeners by keying each subscription", () => {
  assert.notEqual(PILOT_SOURCE.indexOf("const subscriptionKey = `${activeClubId}:${roundId}`;"), -1);
  assert.notEqual(PILOT_SOURCE.indexOf("latestSubscriptionKey.current !== subscriptionKey"), -1);
});
