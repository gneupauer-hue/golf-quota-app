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
    return {
      playerId: `player-${rank}`,
      playerName: `Player ${rank}`,
      team: null,
      holeScores: Array.from({ length: 18 }, () => 2),
      startQuota: totalPoints - 5,
      frontQuota: 0,
      backQuota: 0,
      frontNine: 18,
      backNine: 18,
      frontPlusMinus: 0,
      backPlusMinus: 0,
      totalPoints,
      plusMinus: totalPoints - (totalPoints - 5),
      nextQuota: totalPoints - 4,
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
