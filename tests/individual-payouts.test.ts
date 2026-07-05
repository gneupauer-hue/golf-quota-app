import test from "node:test";
import assert from "node:assert/strict";
import { calculateSideGameResults, type CalculatedRoundRow } from "@/lib/quota";

const expectedPayouts = new Map<number, number[]>([
  [4, [40]],
  [5, [35, 15]],
  [6, [40, 20]],
  [7, [45, 25]],
  [8, [55, 25]],
  [9, [55, 25, 10]],
  [10, [60, 30, 10]],
  [11, [65, 35, 10]],
  [12, [70, 40, 10]],
  [13, [65, 35, 20, 10]],
  [14, [70, 40, 20, 10]],
  [15, [75, 45, 20, 10]],
  [16, [80, 50, 20, 10]],
  [17, [80, 40, 25, 15, 10]],
  [18, [85, 45, 25, 15, 10]],
  [19, [90, 50, 25, 15, 10]],
  [20, [95, 55, 25, 15, 10]],
  [21, [90, 45, 30, 20, 15, 10]],
  [22, [95, 50, 30, 20, 15, 10]],
  [23, [100, 55, 30, 20, 15, 10]],
  [24, [105, 60, 30, 20, 15, 10]],
  [25, [90, 55, 35, 25, 20, 15, 10]],
  [26, [95, 60, 35, 25, 20, 15, 10]],
  [27, [100, 65, 35, 25, 20, 15, 10]],
  [28, [105, 70, 35, 25, 20, 15, 10]],
  [29, [100, 55, 35, 30, 25, 20, 15, 10]],
  [30, [105, 60, 35, 30, 25, 20, 15, 10]],
  [31, [110, 65, 35, 30, 25, 20, 15, 10]],
  [32, [115, 70, 35, 30, 25, 20, 15, 10]]
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
  const results = calculateSideGameResults(buildRows(33));
  assert.equal(results.overallPot.placesPaid, 0);
  assert.deepEqual(results.payoutByPlace, []);
  assert.deepEqual(results.individualPayouts, []);
});

test("individual payout tables through 32 reconcile to the full indy pot", () => {
  for (const [playerCount, payouts] of expectedPayouts) {
    const results = calculateSideGameResults(buildRows(playerCount));
    assert.equal(
      payouts.reduce((sum, amount) => sum + amount, 0),
      playerCount * 10,
      `${playerCount} player payout table should total the indy pot`
    );
    assert.equal(
      results.individualPayouts.reduce((sum, player) => sum + player.payout, 0) + results.individualPayoutRemainder,
      results.overallPot.indyPot,
      `${playerCount} player payouts should reconcile`
    );
    assert.equal(
      results.individualPayouts.every((player) => Number.isInteger(player.payout)),
      true,
      `${playerCount} player payouts should be whole dollars`
    );
    assert.equal(
      results.individualPayouts.every((player) => player.payout >= 10),
      true,
      `${playerCount} player payouts should not include $5 cashing spots`
    );
    assert.equal(
      new Set(payouts).size,
      payouts.length,
      `${playerCount} player payout table should not have duplicate amounts`
    );
    for (let index = 0; index < payouts.length - 1; index += 1) {
      assert.equal(
        payouts[index] > payouts[index + 1],
        true,
        `${playerCount} player payout table should strictly decrease`
      );
    }
    if (playerCount >= 9) {
      assert.equal(
        payouts[payouts.length - 1],
        10,
        `${playerCount} player payout table should end with $10`
      );
    }
  }
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
    { playerName: "Player 2", rank: 2, payout: 17, placeLabel: "2-3" },
    { playerName: "Player 3", rank: 2, payout: 17, placeLabel: "2-3" }
  ]);
});

test("individual quota tied payouts use whole dollars and carry leftover to tip", () => {
  const results = calculateSideGameResults(buildRowsWithResults([2, 1, 1, 0, -1, -2, -3, -4, -5]));

  assert.deepEqual(
    results.individualPayouts.map((player) => player.payout),
    [55, 17, 17]
  );
  assert.equal(results.individualPayoutRemainder, 1);
  assert.equal(
    results.individualPayouts.reduce((sum, player) => sum + player.payout, 0) + results.individualPayoutRemainder,
    results.overallPot.indyPot
  );
});

test("uneven three-way individual quota ties floor to whole dollars", () => {
  const results = calculateSideGameResults(buildRowsWithResults([5, 4, 4, 4, 0, -1, -2, -3, -4, -5, -6, -7, -8]));
  const tiedPayouts = results.individualPayouts
    .filter((player) => player.rank === 2)
    .map((player) => player.payout);

  assert.deepEqual(tiedPayouts, [21, 21, 21]);
  assert.equal(results.individualPayoutRemainder, 2);
  assert.equal(results.individualPayouts.every((player) => Number.isInteger(player.payout)), true);
  assert.equal(
    results.individualPayouts.reduce((sum, player) => sum + player.payout, 0) + results.individualPayoutRemainder,
    results.overallPot.indyPot
  );
});

