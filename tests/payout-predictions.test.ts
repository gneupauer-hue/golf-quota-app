import test from "node:test";
import assert from "node:assert/strict";
import {
  calculatePayoutPredictions,
  type CalculatedRoundRow,
  type TeamCode
} from "@/lib/quota";

function buildRow({
  id,
  name,
  team,
  frontNine,
  backNine,
  frontQuota,
  backQuota,
  birdieHole
}: {
  id: string;
  name: string;
  team: TeamCode;
  frontNine: number;
  backNine: number;
  frontQuota: number;
  backQuota: number;
  birdieHole?: number;
}): CalculatedRoundRow {
  const holeScores = Array.from({ length: 18 }, () => 2 as number | null);
  const startQuota = frontQuota + backQuota;
  const totalPoints = frontNine + backNine;

  if (birdieHole != null) {
    holeScores[birdieHole] = 4;
  }

  return {
    playerId: id,
    playerName: name,
    team,
    holeScores,
    startQuota,
    frontQuota,
    backQuota,
    frontNine,
    backNine,
    frontPlusMinus: frontNine - frontQuota,
    backPlusMinus: backNine - backQuota,
    totalPoints,
    plusMinus: totalPoints - startQuota,
    nextQuota: startQuota,
    rank: 0
  };
}

test("payout predictions produce a traceable per-player breakdown and reconcile to money in play", () => {
  const rows: CalculatedRoundRow[] = [
    buildRow({ id: "p1", name: "Gary", team: "A", frontNine: 20, backNine: 18, frontQuota: 15, backQuota: 15, birdieHole: 0 }),
    buildRow({ id: "p2", name: "Billy", team: "A", frontNine: 20, backNine: 16, frontQuota: 15, backQuota: 15 }),
    buildRow({ id: "p3", name: "Chad", team: "A", frontNine: 19, backNine: 14, frontQuota: 15, backQuota: 15 }),
    buildRow({ id: "p4", name: "Jeff", team: "A", frontNine: 18, backNine: 12, frontQuota: 15, backQuota: 15 }),
    buildRow({ id: "p5", name: "Ryan", team: "B", frontNine: 14, backNine: 20, frontQuota: 15, backQuota: 15 }),
    buildRow({ id: "p6", name: "Scott", team: "B", frontNine: 14, backNine: 19, frontQuota: 15, backQuota: 15 }),
    buildRow({ id: "p7", name: "Bob", team: "B", frontNine: 13, backNine: 18, frontQuota: 15, backQuota: 15 }),
    buildRow({ id: "p8", name: "Lou", team: "B", frontNine: 12, backNine: 17, frontQuota: 15, backQuota: 15 })
  ];

  const payoutPredictions = calculatePayoutPredictions(rows);
  const gary = payoutPredictions.players.find((player) => player.playerId === "p1");
  const billy = payoutPredictions.players.find((player) => player.playerId === "p2");
  const ryan = payoutPredictions.players.find((player) => player.playerId === "p5");

  assert.ok(gary);
  assert.ok(billy);
  assert.ok(ryan);

  assert.equal(gary.front, 10);
  assert.equal(gary.back, 0);
  assert.equal(gary.total, 20);
  assert.equal(gary.indy, 55);
  assert.equal(gary.skins, 80);
  assert.equal(gary.projectedTotal, 165);

  assert.equal(billy.front, 10);
  assert.equal(billy.total, 20);
  assert.equal(billy.indy, 25);
  assert.equal(billy.projectedTotal, 55);

  assert.equal(ryan.front, 0);
  assert.equal(ryan.back, 10);
  assert.equal(ryan.total, 0);
  assert.equal(ryan.indy, 0);
  assert.equal(ryan.skins, 0);
  assert.equal(ryan.projectedTotal, 10);

  assert.equal(payoutPredictions.frontProjectedTotal, 40);
  assert.equal(payoutPredictions.backProjectedTotal, 40);
  assert.equal(payoutPredictions.totalProjectedTotal, 80);
  assert.equal(payoutPredictions.indyProjectedTotal, 80);
  assert.equal(payoutPredictions.skinsProjectedTotal, 80);
  assert.equal(payoutPredictions.frontPot, 40);
  assert.equal(payoutPredictions.backPot, 40);
  assert.equal(payoutPredictions.totalPot, 80);
  assert.equal(payoutPredictions.indyPot, 80);
  assert.equal(payoutPredictions.skinsPot, 80);
  assert.equal(payoutPredictions.moneyCurrentlyInPlay, 320);
  assert.equal(payoutPredictions.overallPot, 320);
  assert.equal(payoutPredictions.projectedPayoutTotal, 320);
  assert.equal(payoutPredictions.unsettledSkinsValue, 0);
  assert.equal(payoutPredictions.isBalanced, true);
  assert.deepEqual(payoutPredictions.mismatchedCategories, []);
});

test("skins-only payout predictions exclude team and indy money while keeping current good skins", () => {
  const rows: CalculatedRoundRow[] = [
    buildRow({ id: "p1", name: "Gary", team: "A", frontNine: 20, backNine: 18, frontQuota: 15, backQuota: 15, birdieHole: 0 }),
    buildRow({ id: "p2", name: "Billy", team: "A", frontNine: 18, backNine: 16, frontQuota: 15, backQuota: 15 }),
    buildRow({ id: "p3", name: "Chad", team: "B", frontNine: 17, backNine: 16, frontQuota: 15, backQuota: 15 }),
    buildRow({ id: "p4", name: "Jeff", team: "B", frontNine: 16, backNine: 15, frontQuota: 15, backQuota: 15 })
  ];

  const payoutPredictions = calculatePayoutPredictions(rows, {
    includeTeamPayouts: false,
    includeIndividualPayouts: false,
    includeSkinsPayouts: true
  });

  assert.equal(payoutPredictions.frontProjectedTotal, 0);
  assert.equal(payoutPredictions.backProjectedTotal, 0);
  assert.equal(payoutPredictions.totalProjectedTotal, 0);
  assert.equal(payoutPredictions.indyProjectedTotal, 0);
  assert.equal(payoutPredictions.skinsProjectedTotal, 40);
  assert.equal(payoutPredictions.skinsPot, 40);
  assert.equal(payoutPredictions.moneyCurrentlyInPlay, 40);
  assert.equal(payoutPredictions.overallPot, 40);
  assert.equal(payoutPredictions.projectedPayoutTotal, 40);
});

test("when no good skins are won yet, skins remain unsettled instead of mismatching reconciliation", () => {
  const rows: CalculatedRoundRow[] = [
    buildRow({ id: "p1", name: "Gary", team: "A", frontNine: 18, backNine: 18, frontQuota: 15, backQuota: 15 }),
    buildRow({ id: "p2", name: "Billy", team: "A", frontNine: 18, backNine: 18, frontQuota: 15, backQuota: 15 }),
    buildRow({ id: "p3", name: "Chad", team: "B", frontNine: 18, backNine: 18, frontQuota: 15, backQuota: 15 }),
    buildRow({ id: "p4", name: "Jeff", team: "B", frontNine: 18, backNine: 18, frontQuota: 15, backQuota: 15 })
  ];

  const payoutPredictions = calculatePayoutPredictions(rows, {
    includeTeamPayouts: false,
    includeIndividualPayouts: false,
    includeSkinsPayouts: true
  });

  assert.equal(payoutPredictions.skinsProjectedTotal, 0);
  assert.equal(payoutPredictions.skinsPot, 0);
  assert.equal(payoutPredictions.unsettledSkinsValue, 40);
  assert.equal(payoutPredictions.isBalanced, true);
  assert.deepEqual(payoutPredictions.mismatchedCategories, []);
});

test("fractional split payouts floor players first and send the exact remainder to the bar", () => {
  const rows: CalculatedRoundRow[] = [
    buildRow({ id: "p1", name: "Gary", team: "A", frontNine: 20, backNine: 18, frontQuota: 15, backQuota: 15, birdieHole: 0 }),
    buildRow({ id: "p2", name: "Billy", team: "A", frontNine: 20, backNine: 17, frontQuota: 15, backQuota: 15 }),
    buildRow({ id: "p3", name: "Chad", team: "A", frontNine: 19, backNine: 16, frontQuota: 15, backQuota: 15 }),
    buildRow({ id: "p4", name: "Jeff", team: "B", frontNine: 20, backNine: 14, frontQuota: 15, backQuota: 15 }),
    buildRow({ id: "p5", name: "Ryan", team: "B", frontNine: 20, backNine: 13, frontQuota: 15, backQuota: 15 }),
    buildRow({ id: "p6", name: "Scott", team: "B", frontNine: 19, backNine: 12, frontQuota: 15, backQuota: 15 }),
    buildRow({ id: "p7", name: "Bob", team: "C", frontNine: 20, backNine: 11, frontQuota: 15, backQuota: 15 }),
    buildRow({ id: "p8", name: "Lou", team: "C", frontNine: 20, backNine: 10, frontQuota: 15, backQuota: 15 }),
    buildRow({ id: "p9", name: "Mike", team: "C", frontNine: 19, backNine: 9, frontQuota: 15, backQuota: 15 }),
    buildRow({ id: "p10", name: "Pat", team: "D", frontNine: 14, backNine: 20, frontQuota: 15, backQuota: 15 }),
    buildRow({ id: "p11", name: "Tony", team: "D", frontNine: 13, backNine: 19, frontQuota: 15, backQuota: 15 }),
    buildRow({ id: "p12", name: "Jake", team: "D", frontNine: 12, backNine: 18, frontQuota: 15, backQuota: 15 }),
    buildRow({ id: "p13", name: "Matt", team: "D", frontNine: 11, backNine: 17, frontQuota: 15, backQuota: 15 })
  ];

  const payoutPredictions = calculatePayoutPredictions(rows);

  for (const player of payoutPredictions.players) {
    assert.equal(Number.isInteger(player.front), true);
    assert.equal(Number.isInteger(player.back), true);
    assert.equal(Number.isInteger(player.total), true);
    assert.equal(Number.isInteger(player.indy), true);
    assert.equal(Number.isInteger(player.skins), true);
    assert.equal(Number.isInteger(player.projectedTotal), true);
  }

  assert.equal(payoutPredictions.frontProjectedTotal + payoutPredictions.frontBarRemainder, payoutPredictions.frontPot);
  assert.equal(payoutPredictions.backProjectedTotal + payoutPredictions.backBarRemainder, payoutPredictions.backPot);
  assert.equal(payoutPredictions.totalProjectedTotal + payoutPredictions.totalBarRemainder, payoutPredictions.totalPot);
  assert.equal(payoutPredictions.indyProjectedTotal + payoutPredictions.indyBarRemainder, payoutPredictions.indyPot);
  assert.equal(payoutPredictions.skinsProjectedTotal + payoutPredictions.skinsBarRemainder, payoutPredictions.skinsPot);
  assert.equal(payoutPredictions.projectedPayoutTotal + payoutPredictions.barRemainder, payoutPredictions.overallPot);
  assert.equal(payoutPredictions.isBalanced, true);
  assert.deepEqual(payoutPredictions.mismatchedCategories, []);
});
