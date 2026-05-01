import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateGoodSkins,
  calculateRoundRows,
  type GoodSkinEntry,
  type RoundRowInput
} from "@/lib/quota";

function row(playerId: string, playerName: string, goodSkinEntries: GoodSkinEntry[] = []): RoundRowInput {
  return {
    playerId,
    playerName,
    team: null,
    startQuota: 30,
    scoringEntryMode: "QUICK",
    quickFrontNine: 15,
    quickBackNine: 15,
    holeScores: Array.from({ length: 18 }, () => null),
    goodSkinEntries
  };
}

function skin(holeNumber: number, score: 4 | 6 | 8): GoodSkinEntry {
  return {
    holeNumber,
    type: score === 8 ? "ace" : score === 6 ? "eagle" : "birdie",
    score
  };
}

function skinsFor(rows: RoundRowInput[]) {
  return calculateGoodSkins(calculateRoundRows(rows));
}

test("scorecard skins allow a player with no skins", () => {
  const result = skinsFor([row("p1", "Gary"), row("p2", "Billy")]);

  assert.equal(result.winners.length, 0);
  assert.equal(result.totalSkinSharesWon, 0);
});

test("scorecard skins award one birdie", () => {
  const result = skinsFor([row("p1", "Gary", [skin(4, 4)]), row("p2", "Billy")]);

  assert.equal(result.winners[0]?.playerName, "Gary");
  assert.equal(result.holes.find((hole) => hole.holeNumber === 4)?.skinAwarded, true);
});

test("scorecard skins award multiple birdies for one player", () => {
  const result = skinsFor([row("p1", "Gary", [skin(4, 4), skin(11, 4)]), row("p2", "Billy")]);

  assert.equal(result.winners[0]?.playerName, "Gary");
  assert.equal(result.winners[0]?.skinsWon, 2);
});

test("scorecard skins cancel when two players birdie the same hole", () => {
  const result = skinsFor([
    row("p1", "Gary", [skin(4, 4)]),
    row("p2", "Billy", [skin(4, 4)])
  ]);
  const hole = result.holes.find((candidate) => candidate.holeNumber === 4);

  assert.equal(hole?.skinAwarded, false);
  assert.equal(result.winners.length, 0);
});

test("scorecard skins let an eagle beat a birdie on the same hole", () => {
  const result = skinsFor([
    row("p1", "Gary", [skin(4, 4)]),
    row("p2", "Billy", [skin(4, 6)])
  ]);
  const hole = result.holes.find((candidate) => candidate.holeNumber === 4);

  assert.equal(hole?.skinAwarded, true);
  assert.equal(hole?.winnerName, "Billy");
});

test("scorecard skins let a hole-in-one beat eagle and birdie on the same hole", () => {
  const result = skinsFor([
    row("p1", "Gary", [skin(4, 4)]),
    row("p2", "Billy", [skin(4, 6)]),
    row("p3", "Chad", [skin(4, 8)])
  ]);
  const hole = result.holes.find((candidate) => candidate.holeNumber === 4);

  assert.equal(hole?.skinAwarded, true);
  assert.equal(hole?.winnerName, "Chad");
});