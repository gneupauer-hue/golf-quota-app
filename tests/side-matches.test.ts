import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SIDE_MATCH_STAKE, deriveSideMatch, type SideMatchRecord } from "@/lib/side-matches";
import type { CalculatedRoundRow, GoodSkinEntry } from "@/lib/quota";

function skins(count: number): GoodSkinEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    holeNumber: index + 1,
    type: "birdie" as const,
    score: 4
  }));
}

function makeRow(
  playerId: string,
  playerName: string,
  holeScores: Array<number | null>,
  goodSkinEntries: GoodSkinEntry[] = []
): CalculatedRoundRow {
  return {
    playerId,
    playerName,
    team: null,
    holeScores,
    startQuota: 0,
    goodSkinEntries,
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

function fill(value: number | null, from = 0, to = 18): Array<number | null> {
  return Array.from({ length: 18 }, (_, index) => (index >= from && index < to ? value : null));
}

test("stake defaults to $5 per bet", () => {
  assert.equal(DEFAULT_SIDE_MATCH_STAKE, 5);
});

test("team A sweeping all 18 holes + more skins wins all four bets ($20)", () => {
  const rows = [
    makeRow("p1", "Al A", fill(2), skins(3)),
    makeRow("p2", "Bo A", fill(0)),
    makeRow("p3", "Cy B", fill(1), skins(1)),
    makeRow("p4", "Di B", fill(0))
  ];
  const derived = deriveSideMatch(MATCH, rows);

  assert.equal(derived.front.winner, "A");
  assert.equal(derived.back.winner, "A");
  assert.equal(derived.total.winner, "A");
  assert.equal(derived.skins.teamACount, 3);
  assert.equal(derived.skins.teamBCount, 1);
  assert.equal(derived.skins.winner, "A");
  assert.equal(derived.payout.teamAWon, 20);
  assert.equal(derived.payout.teamBWon, 0);
  assert.equal(derived.payout.net, 20);
});

test("a tied skins count is a push (no money for skins)", () => {
  const rows = [
    makeRow("p1", "Al A", fill(2), skins(2)),
    makeRow("p2", "Bo A", fill(0)),
    makeRow("p3", "Cy B", fill(1), skins(2)),
    makeRow("p4", "Di B", fill(0))
  ];
  const derived = deriveSideMatch(MATCH, rows);
  assert.equal(derived.skins.winner, null);
  const skinsBet = derived.payout.bets.find((bet) => bet.key === "skins");
  assert.equal(skinsBet?.winner, null);
  // front/back/total still go to A ($15), skins is a push.
  assert.equal(derived.payout.net, 15);
});

test("unfinished back nine leaves back/total/skins unsettled", () => {
  const rows = [
    makeRow("p1", "Al A", fill(2, 0, 9), skins(3)),
    makeRow("p2", "Bo A", fill(0, 0, 9)),
    makeRow("p3", "Cy B", fill(1, 0, 9), skins(1)),
    makeRow("p4", "Di B", fill(0, 0, 9))
  ];
  const derived = deriveSideMatch(MATCH, rows);

  const byKey = Object.fromEntries(derived.payout.bets.map((bet) => [bet.key, bet]));
  assert.equal(byKey.front.settled, true);
  assert.equal(byKey.front.winner, "A");
  assert.equal(byKey.back.settled, false);
  assert.equal(byKey.total.settled, false);
  assert.equal(byKey.skins.settled, false);
  // Only the finished front bet pays out.
  assert.equal(derived.payout.net, 5);
});

test("supports a 1v1 individual match (one player per side)", () => {
  const oneVsOne: SideMatchRecord = { ...MATCH, teamAPlayerIds: ["p1"], teamBPlayerIds: ["p3"] };
  const rows = [
    makeRow("p1", "Al A", fill(2), skins(2)),
    makeRow("p3", "Cy B", fill(1), skins(0))
  ];
  const derived = deriveSideMatch(oneVsOne, rows);
  assert.equal(derived.total.winner, "A");
  assert.equal(derived.skins.teamACount, 2);
  assert.equal(derived.skins.teamBCount, 0);
  assert.equal(derived.payout.net, 20);
});

test("custom stake scales the payouts", () => {
  const rows = [
    makeRow("p1", "Al A", fill(2), skins(1)),
    makeRow("p2", "Bo A", fill(0)),
    makeRow("p3", "Cy B", fill(1)),
    makeRow("p4", "Di B", fill(0))
  ];
  const derived = deriveSideMatch(MATCH, rows, 10);
  assert.equal(derived.payout.stake, 10);
  assert.equal(derived.payout.net, 40); // all four bets to A at $10
});
