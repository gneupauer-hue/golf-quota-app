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

test("Gary Neupauer carries a +2 result forward into the next round", () => {
  const rebuilt = rebuildPlayerQuotaHistory({
    startingQuota: 17,
    currentQuota: 18,
    rounds: [
      makeRound({
        roundId: "gary-1",
        roundName: "Apr 19",
        completedAt: "2026-04-19T12:00:00.000Z",
        totalPoints: 19,
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
      movement: round.quotaMovement,
      nextQuota: round.nextQuota,
      plusMinus: round.plusMinus
    })),
    [
      { startQuota: 17, movement: 2, nextQuota: 19, plusMinus: 2 },
      { startQuota: 19, movement: 0, nextQuota: 19, plusMinus: 0 }
    ]
  );
  assert.equal(rebuilt.currentQuota, 19);
});

test("Billy Mattioli keeps full negative adjustment instead of a capped drop", () => {
  const rebuilt = rebuildPlayerQuotaHistory({
    startingQuota: 27,
    currentQuota: 26,
    rounds: [
      makeRound({
        roundId: "billy-1",
        roundName: "Apr 19",
        completedAt: "2026-04-19T12:00:00.000Z",
        totalPoints: 25,
        startQuota: 26,
        plusMinus: -1,
        nextQuota: 26
      })
    ]
  });

  assert.equal(rebuilt.roundsAscending[0]?.startQuota, 27);
  assert.equal(rebuilt.roundsAscending[0]?.plusMinus, -2);
  assert.equal(rebuilt.roundsAscending[0]?.quotaMovement, -2);
  assert.equal(rebuilt.roundsAscending[0]?.nextQuota, 25);
  assert.equal(rebuilt.currentQuota, 25);
});

test("Bob Lipski keeps the true starting quota and full -4 movement", () => {
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
  assert.equal(rebuilt.roundsAscending[0]?.quotaMovement, -4);
  assert.equal(rebuilt.roundsAscending[0]?.nextQuota, 30);
  assert.equal(rebuilt.currentQuota, 30);
});
