import test from "node:test";
import assert from "node:assert/strict";
import { rebuildPlayerQuotaHistory } from "@/lib/quota-history";

function makeRound(args: {
  roundId: string;
  roundName: string;
  completedAt: string;
  totalPoints: number;
  startQuota: number;
  plusMinus: number;
  nextQuota: number;
}) {
  return {
    roundId: args.roundId,
    roundName: args.roundName,
    roundDate: new Date(args.completedAt),
    completedAt: new Date(args.completedAt),
    createdAt: new Date(args.completedAt),
    totalPoints: args.totalPoints,
    startQuota: args.startQuota,
    plusMinus: args.plusMinus,
    nextQuota: args.nextQuota
  };
}

test("+4 raw result moves quota up by the capped +2 maximum", () => {
  const rebuilt = rebuildPlayerQuotaHistory({
    startingQuota: 17,
    currentQuota: 18,
    rounds: [
      makeRound({
        roundId: "gary-1",
        roundName: "Apr 19",
        completedAt: "2026-04-19T12:00:00.000Z",
        totalPoints: 21,
        startQuota: 17,
        plusMinus: 2,
        nextQuota: 18
      }),
      makeRound({
        roundId: "gary-2",
        roundName: "Apr 24",
        completedAt: "2026-04-24T12:00:00.000Z",
        totalPoints: 19,
        startQuota: 18,
        plusMinus: 1,
        nextQuota: 19
      })
    ]
  });

  assert.deepEqual(
    rebuilt.roundsAscending.map((round) => ({
      startQuota: round.startQuota,
      rawResult: round.plusMinus,
      movement: round.quotaMovement,
      nextQuota: round.nextQuota
    })),
    [
      { startQuota: 17, rawResult: 4, movement: 2, nextQuota: 19 },
      { startQuota: 19, rawResult: 0, movement: 0, nextQuota: 19 }
    ]
  );
  assert.equal(rebuilt.currentQuota, 19);
});

test("+2 raw result moves quota up by +2", () => {
  const rebuilt = rebuildPlayerQuotaHistory({
    startingQuota: 20,
    currentQuota: 20,
    rounds: [
      makeRound({
        roundId: "plus-two",
        roundName: "Apr 19",
        completedAt: "2026-04-19T12:00:00.000Z",
        totalPoints: 22,
        startQuota: 20,
        plusMinus: 1,
        nextQuota: 21
      })
    ]
  });

  assert.equal(rebuilt.roundsAscending[0]?.plusMinus, 2);
  assert.equal(rebuilt.roundsAscending[0]?.quotaMovement, 2);
  assert.equal(rebuilt.roundsAscending[0]?.nextQuota, 22);
});

test("+1 raw result moves quota up by +1", () => {
  const rebuilt = rebuildPlayerQuotaHistory({
    startingQuota: 20,
    currentQuota: 20,
    rounds: [
      makeRound({
        roundId: "plus-one",
        roundName: "Apr 19",
        completedAt: "2026-04-19T12:00:00.000Z",
        totalPoints: 21,
        startQuota: 20,
        plusMinus: 0,
        nextQuota: 20
      })
    ]
  });

  assert.equal(rebuilt.roundsAscending[0]?.plusMinus, 1);
  assert.equal(rebuilt.roundsAscending[0]?.quotaMovement, 1);
  assert.equal(rebuilt.roundsAscending[0]?.nextQuota, 21);
});

test("Even raw result leaves quota unchanged", () => {
  const rebuilt = rebuildPlayerQuotaHistory({
    startingQuota: 19,
    currentQuota: 19,
    rounds: [
      makeRound({
        roundId: "even",
        roundName: "Apr 24",
        completedAt: "2026-04-24T12:00:00.000Z",
        totalPoints: 19,
        startQuota: 21,
        plusMinus: -2,
        nextQuota: 20
      })
    ]
  });

  assert.equal(rebuilt.roundsAscending[0]?.plusMinus, 0);
  assert.equal(rebuilt.roundsAscending[0]?.quotaMovement, 0);
  assert.equal(rebuilt.roundsAscending[0]?.nextQuota, 19);
});

test("any negative raw result moves quota down by the capped -1 maximum", () => {
  const rebuilt = rebuildPlayerQuotaHistory({
    startingQuota: 34,
    currentQuota: 32,
    rounds: [
      makeRound({
        roundId: "bob-1",
        roundName: "Apr 19",
        completedAt: "2026-04-19T12:00:00.000Z",
        totalPoints: 30,
        startQuota: 32,
        plusMinus: -2,
        nextQuota: 31
      })
    ]
  });

  assert.equal(rebuilt.roundsAscending[0]?.startQuota, 34);
  assert.equal(rebuilt.roundsAscending[0]?.plusMinus, -4);
  assert.equal(rebuilt.roundsAscending[0]?.quotaMovement, -1);
  assert.equal(rebuilt.roundsAscending[0]?.nextQuota, 33);
  assert.equal(rebuilt.currentQuota, 33);
});
