import test from "node:test";
import assert from "node:assert/strict";
import { calculateSideGameResults, type CalculatedRoundRow } from "@/lib/quota";

const expectedPayouts = new Map<number, number[]>([
  [4, [20]],
  [6, [40, 20]],
  [7, [45, 25]],
  [8, [55, 25]],
  [9, [55, 25, 10]],
  [10, [60, 30, 10]],
  [11, [65, 35, 10]],
  [12, [70, 35, 15]],
  [13, [65, 40, 20, 5]],
  [14, [70, 40, 20, 10]],
  [15, [75, 45, 25, 5]],
  [16, [80, 50, 25, 5]]
]);

function buildRows(playerCount: number): CalculatedRoundRow[] {
  return Array.from({ length: playerCount }, (_, index) => {
    const rank = index + 1;
    const totalPoints = 40 - index;
    const plusMinus = playerCount - index;
    const startQuota = totalPoints - plusMinus;
    return {
      playerId: `player-${rank}`,
      playerName: `Player ${rank}`,
      team: null,
      holeScores: Array.from({ length: 18 }, () => 2),
      startQuota,
      frontQuota: 0,
      backQuota: 0,
      frontNine: 18,
      backNine: 18,
      frontPlusMinus: 0,
      backPlusMinus: 0,
      totalPoints,
      plusMinus,
      nextQuota: startQuota + 1,
      rank
    };
  });
}

function buildRowsWithResults(results: number[]): CalculatedRoundRow[] {
  return results.map((plusMinus, index) => {
    const rank = index + 1;
    const totalPoints = 40 - index;
    const startQuota = totalPoints - plusMinus;
    return {
      playerId: `player-${rank}`,
      playerName: `Player ${rank}`,
      team: null,
      holeScores: Array.from({ length: 18 }, () => 2),
      startQuota,
      frontQuota: 0,
      backQuota: 0,
      frontNine: 18,
      backNine: 18,
      frontPlusMinus: 0,
      backPlusMinus: 0,
      totalPoints,
      plusMinus,
      nextQuota: startQuota + 1,
      rank
    };
  });
}

for (const [playerCount, payouts] of expectedPayouts) {
  test(`individual payouts use the exact fixed table for ${playerCount} players`, () => {
    const results = calculateSideGameResults(buildRows(playerCount));
    assert.equal(results.overallPot.placesPaid, payouts.length);
    assert.deepEqual(
      results.payoutByPlace.map((entry) => entry.payout),
      payouts
    );
  });
}

test("unsupported player counts do not invent percentage-based individual payouts", () => {
  const results = calculateSideGameResults(buildRows(5));
  assert.equal(results.overallPot.placesPaid, 0);
  assert.deepEqual(results.payoutByPlace, []);
  assert.deepEqual(results.individualPayouts, []);
});

test("two players tied for first split first and second individual quota payouts", () => {
  const results = calculateSideGameResults(buildRowsWithResults([-1, -1, -2, -3, -4, -5]));
  const payouts = results.individualPayouts.map((player) => ({
    playerName: player.playerName,
    rank: player.rank,
    payout: player.payout,
    placeLabel: player.placeLabel
  }));

  assert.deepEqual(payouts, [
    { playerName: "Player 1", rank: 1, payout: 30, placeLabel: "1-2" },
    { playerName: "Player 2", rank: 1, payout: 30, placeLabel: "1-2" }
  ]);
});

test("three players tied for first split first through third individual quota payouts", () => {
  const results = calculateSideGameResults(buildRowsWithResults([0, 0, 0, -1, -2, -3, -4, -5, -6]));
  const payouts = results.individualPayouts.map((player) => player.payout);
  const ranks = results.individualPayouts.map((player) => player.rank);

  assert.deepEqual(payouts, [30, 30, 30]);
  assert.deepEqual(ranks, [1, 1, 1]);
});

test("two players tied for second split second and third individual quota payouts", () => {
  const results = calculateSideGameResults(buildRowsWithResults([2, 1, 1, 0, -1, -2, -3, -4, -5]));
  const payouts = results.individualPayouts.map((player) => ({
    playerName: player.playerName,
    rank: player.rank,
    payout: player.payout,
    placeLabel: player.placeLabel
  }));

  assert.deepEqual(payouts, [
    { playerName: "Player 1", rank: 1, payout: 55, placeLabel: "1" },
    { playerName: "Player 2", rank: 2, payout: 17.5, placeLabel: "2-3" },
    { playerName: "Player 3", rank: 2, payout: 17.5, placeLabel: "2-3" }
  ]);
});
