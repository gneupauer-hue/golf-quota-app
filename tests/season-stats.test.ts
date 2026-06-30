import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateSeasonStatsFromRounds,
  type SeasonStatsEntryInput,
  type SeasonStatsRoundInput
} from "@/lib/season-stats";
import type { TeamCode } from "@/lib/quota";

const completedAt = new Date("2026-06-13T20:00:00.000Z");
const seasonStartDate = new Date("2026-01-01T00:00:00.000Z");

function entry(
  playerNumber: number,
  overrides: Partial<SeasonStatsEntryInput> = {}
): SeasonStatsEntryInput {
  return {
    playerId: `p${playerNumber}`,
    playerName: `Player ${playerNumber}`,
    team: null,
    holeScores: Array(18).fill(null),
    startQuota: 20,
    scoringEntryMode: "QUICK",
    quickFrontNine: 15,
    quickBackNine: 15,
    birdieHolesCsv: "",
    ...overrides
  };
}

function round(
  entries: SeasonStatsEntryInput[],
  overrides: Partial<SeasonStatsRoundInput> = {}
): SeasonStatsRoundInput {
  return {
    id: "round-1",
    roundName: "Round 1",
    roundDate: completedAt,
    completedAt,
    canceledAt: null,
    isTestRound: false,
    roundMode: "MATCH_QUOTA",
    scoringEntryMode: "QUICK",
    entries,
    ...overrides
  };
}

function stats(rounds: SeasonStatsRoundInput[]) {
  return calculateSeasonStatsFromRounds(rounds, {
    seasonStartDate,
    seasonYear: 2026
  });
}

function datedRound(
  roundNumber: number,
  entries: SeasonStatsEntryInput[],
  overrides: Partial<SeasonStatsRoundInput> = {}
) {
  const date = new Date(`2026-06-${10 + roundNumber}T20:00:00.000Z`);
  return round(entries, {
    id: `round-${roundNumber}`,
    roundName: `Round ${roundNumber}`,
    roundDate: date,
    completedAt: date,
    ...overrides
  });
}

test("season stats exclude test rounds and unfinalized rounds", () => {
  const data = stats([
    round([entry(1)]),
    round([entry(2)], { id: "test-round", isTestRound: true }),
    round([entry(3)], { id: "open-round", completedAt: null })
  ]);

  assert.equal(data.roundsCount, 1);
  assert.equal(data.players.length, 1);
  assert.equal(data.players[0]?.playerName, "Player 1");
});

test("season stats count rounds played per player", () => {
  const data = stats([
    datedRound(1, [entry(1), entry(2)]),
    datedRound(2, [entry(1)]),
    datedRound(3, [entry(1), entry(3)])
  ]);

  assert.equal(data.players.find((row) => row.playerId === "p1")?.roundsPlayed, 3);
  assert.equal(data.players.find((row) => row.playerId === "p2")?.roundsPlayed, 1);
  assert.equal(data.leaderboards.roundsPlayed[0]?.playerId, "p1");
});

test("season stats count front, back, and total team wins plus team cash rounds", () => {
  const data = stats([
    round([
      entry(1, { team: "A", quickFrontNine: 20, quickBackNine: 20 }),
      entry(2, { team: "A", quickFrontNine: 20, quickBackNine: 20 }),
      entry(3, { team: "B", quickFrontNine: 10, quickBackNine: 10 }),
      entry(4, { team: "B", quickFrontNine: 10, quickBackNine: 10 })
    ])
  ]);

  assert.equal(data.players.find((row) => row.playerId === "p1")?.teamWins, 3);
  assert.equal(data.players.find((row) => row.playerId === "p1")?.teamCashes, 1);
  assert.equal(data.players.find((row) => row.playerId === "p2")?.teamWins, 3);
  assert.equal(data.players.find((row) => row.playerId === "p3")?.teamWins, 0);
  assert.equal(data.leaderboards.teamWins[0]?.playerId, "p1");
  assert.equal(data.leaderboards.teamCashes[0]?.playerId, "p1");
});

test("season stats count individual quota wins and cashes", () => {
  const data = stats([
    round(
      [
        entry(1, { quickFrontNine: 24, quickBackNine: 24 }),
        entry(2, { quickFrontNine: 15, quickBackNine: 15 }),
        entry(3, { quickFrontNine: 14, quickBackNine: 14 }),
        entry(4, { quickFrontNine: 13, quickBackNine: 13 })
      ],
      { roundMode: "SKINS_ONLY" }
    )
  ]);

  assert.equal(data.players.find((row) => row.playerId === "p1")?.indyWins, 1);
  assert.equal(data.players.find((row) => row.playerId === "p1")?.indyCashes, 1);
  assert.equal(data.players.find((row) => row.playerId === "p2")?.indyCashes, 0);
});

test("season stats keep bartender tip out of player money totals", () => {
  const entries = Array.from({ length: 11 }, (_, index) => {
    const playerNumber = index + 1;
    const skin =
      playerNumber === 1
        ? "1:birdie"
        : playerNumber === 2
          ? "2:birdie"
          : playerNumber === 3
            ? "3:birdie"
            : "";

    return entry(playerNumber, {
      team: String.fromCharCode(65 + index) as TeamCode,
      quickFrontNine: 15 + playerNumber,
      quickBackNine: 15,
      birdieHolesCsv: skin
    });
  });
  const data = stats([round(entries, { roundMode: "SKINS_ONLY" })]);
  const totalPlayerMoney = data.players.reduce((total, player) => total + player.moneyWon, 0);

  assert.equal(data.bartenderTip, 2);
  assert.equal(totalPlayerMoney, 218);
});

test("season stats calculate money and cash per-round rates", () => {
  const data = stats([
    datedRound(
      1,
      [
        entry(1, { quickFrontNine: 24, quickBackNine: 24, birdieHolesCsv: "1:birdie" }),
        entry(2, { quickFrontNine: 15, quickBackNine: 15 }),
        entry(3, { quickFrontNine: 14, quickBackNine: 14 }),
        entry(4, { quickFrontNine: 13, quickBackNine: 13 })
      ],
      { roundMode: "SKINS_ONLY" }
    ),
    datedRound(
      2,
      [
        entry(1, { quickFrontNine: 24, quickBackNine: 24, birdieHolesCsv: "2:birdie" }),
        entry(2, { quickFrontNine: 15, quickBackNine: 15 }),
        entry(3, { quickFrontNine: 14, quickBackNine: 14 }),
        entry(4, { quickFrontNine: 13, quickBackNine: 13 })
      ],
      { roundMode: "SKINS_ONLY" }
    ),
    datedRound(
      3,
      [
        entry(1, { quickFrontNine: 24, quickBackNine: 24, birdieHolesCsv: "3:birdie" }),
        entry(2, { quickFrontNine: 15, quickBackNine: 15 }),
        entry(3, { quickFrontNine: 14, quickBackNine: 14 }),
        entry(4, { quickFrontNine: 13, quickBackNine: 13 })
      ],
      { roundMode: "SKINS_ONLY" }
    )
  ]);

  const player = data.players.find((row) => row.playerId === "p1");
  assert.equal(player?.roundsPlayed, 3);
  assert.equal(player?.indyCashRate, 1);
  assert.equal(data.rateLeaderboards.moneyPerRound[0]?.playerId, "p1");
  assert.equal(data.rateLeaderboards.indyCashRate[0]?.playerId, "p1");
});

test("season stats calculate team cash rate separately from team win totals", () => {
  const winningTeamRound = (roundNumber: number) =>
    datedRound(roundNumber, [
      entry(1, { team: "A", quickFrontNine: 20, quickBackNine: 20 }),
      entry(2, { team: "A", quickFrontNine: 20, quickBackNine: 20 }),
      entry(3, { team: "B", quickFrontNine: 10, quickBackNine: 10 }),
      entry(4, { team: "B", quickFrontNine: 10, quickBackNine: 10 })
    ]);
  const losingTeamRound = datedRound(3, [
    entry(1, { team: "A", quickFrontNine: 10, quickBackNine: 10 }),
    entry(2, { team: "A", quickFrontNine: 10, quickBackNine: 10 }),
    entry(3, { team: "B", quickFrontNine: 20, quickBackNine: 20 }),
    entry(4, { team: "B", quickFrontNine: 20, quickBackNine: 20 })
  ]);
  const data = stats([winningTeamRound(1), winningTeamRound(2), losingTeamRound]);
  const player = data.players.find((row) => row.playerId === "p1");

  assert.equal(player?.teamWins, 6);
  assert.equal(player?.teamCashes, 2);
  assert.equal(player?.teamCashRate, 2 / 3);
  assert.equal(data.rateLeaderboards.teamCashRate[0]?.playerId, "p1");
});

test("season stats exclude players under 3 rounds from rate boards but keep raw totals", () => {
  const data = stats([
    datedRound(1, [
      entry(1, { quickFrontNine: 24, quickBackNine: 24 }),
      entry(2, { quickFrontNine: 15, quickBackNine: 15 }),
      entry(3, { quickFrontNine: 14, quickBackNine: 14 }),
      entry(4, { quickFrontNine: 13, quickBackNine: 13 }),
      entry(9, { quickFrontNine: 40, quickBackNine: 40, birdieHolesCsv: "1:birdie" })
    ], { roundMode: "SKINS_ONLY" }),
    datedRound(2, [
      entry(1, { quickFrontNine: 24, quickBackNine: 24 }),
      entry(2, { quickFrontNine: 15, quickBackNine: 15 }),
      entry(3, { quickFrontNine: 14, quickBackNine: 14 }),
      entry(4, { quickFrontNine: 13, quickBackNine: 13 })
    ], { roundMode: "SKINS_ONLY" }),
    datedRound(3, [
      entry(1, { quickFrontNine: 24, quickBackNine: 24 }),
      entry(2, { quickFrontNine: 15, quickBackNine: 15 }),
      entry(3, { quickFrontNine: 14, quickBackNine: 14 }),
      entry(4, { quickFrontNine: 13, quickBackNine: 13 })
    ], { roundMode: "SKINS_ONLY" })
  ]);

  assert.equal(data.players.find((row) => row.playerId === "p9")?.roundsPlayed, 1);
  assert.equal(data.leaderboards.moneyWon.some((row) => row.playerId === "p9"), true);
  assert.equal(data.rateLeaderboards.moneyPerRound.some((row) => row.playerId === "p9"), false);
});
