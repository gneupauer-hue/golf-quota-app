import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SIDE_MATCH_STAKE, deriveSideMatch, type SideMatchRecord } from "@/lib/side-matches";
import type { CalculatedRoundRow } from "@/lib/quota";

// Per-hole points: 6=eagle, 4=birdie, 2=par, 1=bogey, 0=double, -1=worse.
// A "skin" = birdie or better (a hole scored 4 or 6).
function makeHoles(base: number, overrides: Record<number, number> = {}, to = 18): Array<number | null> {
  return Array.from({ length: 18 }, (_, index) => (index < to ? overrides[index] ?? base : null));
}

function makeRow(
  playerId: string,
  playerName: string,
  holeScores: Array<number | null>
): CalculatedRoundRow {
  return {
    playerId,
    playerName,
    team: null,
    holeScores,
    startQuota: 0,
    frontQuota: 0,
    backQuota: 0,
    frontNine: 0,
    backNine: 0,
    frontPlusMinus: 0,
    backPlusMinus: 0,
    totalPoints: 0,
    plusMinus: 0,
    nextQuota: 0,
    rank: 0
  };
}

const MATCH: SideMatchRecord = {
  id: "m1",
  roundId: "r1",
  name: null,
  teamAPlayerIds: ["p1", "p2"],
  teamBPlayerIds: ["p3", "p4"],
  createdAt: "2026-07-21T00:00:00.000Z"
};

test("stake defaults to $5 per bet", () => {
  assert.equal(DEFAULT_SIDE_MATCH_STAKE, 5);
});

test("skins derive from hole points (birdie/eagle), and team A sweeps for $20", () => {
  const rows = [
    // three eagles (6) → 3 skins; rest pars (2)
    makeRow("p1", "Al A", makeHoles(2, { 0: 6, 1: 6, 2: 6 })),
    makeRow("p2", "Bo A", makeHoles(0)),
    // one birdie (4) on hole 1 (< A's 6, so A still wins it) → 1 skin; rest bogeys
    makeRow("p3", "Cy B", makeHoles(1, { 0: 4 })),
    makeRow("p4", "Di B", makeHoles(0))
  ];
  const derived = deriveSideMatch(MATCH, rows);

  assert.equal(derived.front.winner, "A");
  assert.equal(derived.back.winner, "A");
  assert.equal(derived.total.winner, "A");
  assert.equal(derived.skins.teamACount, 3);
  assert.equal(derived.skins.teamBCount, 1);
  assert.equal(derived.skins.winner, "A");
  assert.equal(derived.payout.net, 20);
});

test("a tied skins count is a push (front/back/total to A = $15)", () => {
  const rows = [
    makeRow("p1", "Al A", makeHoles(2, { 0: 6, 1: 6 })), // 2 skins, wins holes 0/1 at 6
    makeRow("p2", "Bo A", makeHoles(0)),
    makeRow("p3", "Cy B", makeHoles(1, { 0: 4, 1: 4 })), // 2 skins (4<6 so A still wins)
    makeRow("p4", "Di B", makeHoles(0))
  ];
  const derived = deriveSideMatch(MATCH, rows);
  assert.equal(derived.skins.winner, null);
  assert.equal(derived.payout.bets.find((bet) => bet.key === "skins")?.winner, null);
  assert.equal(derived.payout.net, 15);
});

test("unfinished back nine leaves back/total/skins unsettled (front pays only)", () => {
  const rows = [
    makeRow("p1", "Al A", makeHoles(2, { 0: 6 }, 9)),
    makeRow("p2", "Bo A", makeHoles(0, {}, 9)),
    makeRow("p3", "Cy B", makeHoles(1, {}, 9)),
    makeRow("p4", "Di B", makeHoles(0, {}, 9))
  ];
  const derived = deriveSideMatch(MATCH, rows);
  const byKey = Object.fromEntries(derived.payout.bets.map((bet) => [bet.key, bet]));
  assert.equal(byKey.front.settled, true);
  assert.equal(byKey.front.winner, "A");
  assert.equal(byKey.back.settled, false);
  assert.equal(byKey.total.settled, false);
  assert.equal(byKey.skins.settled, false);
  assert.equal(derived.payout.net, 5);
});

test("supports a 1v1 individual match (one player per side)", () => {
  const oneVsOne: SideMatchRecord = { ...MATCH, teamAPlayerIds: ["p1"], teamBPlayerIds: ["p3"] };
  const rows = [
    makeRow("p1", "Al A", makeHoles(2, { 0: 6, 1: 6 })), // 2 skins
    makeRow("p3", "Cy B", makeHoles(1)) // 0 skins
  ];
  const derived = deriveSideMatch(oneVsOne, rows);
  assert.equal(derived.total.winner, "A");
  assert.equal(derived.skins.teamACount, 2);
  assert.equal(derived.skins.teamBCount, 0);
  assert.equal(derived.payout.net, 20);
});

test("custom stake scales the payouts", () => {
  const rows = [
    makeRow("p1", "Al A", makeHoles(2, { 0: 6 })),
    makeRow("p2", "Bo A", makeHoles(0)),
    makeRow("p3", "Cy B", makeHoles(1)),
    makeRow("p4", "Di B", makeHoles(0))
  ];
  const derived = deriveSideMatch(MATCH, rows, 10);
  assert.equal(derived.payout.stake, 10);
  assert.equal(derived.payout.net, 40);
});
