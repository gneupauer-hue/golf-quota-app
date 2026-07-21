import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateNextQuota } from "@/lib/quota";
import { rebuildPlayerQuotaHistory } from "@/lib/quota-history";
import {
  calculateAdjustedQuota,
  calculateTeeAdjustment,
  defaultTee,
  formatTeeAdjustment,
  moveTeeBack,
  moveTeeForward,
  normalizeTee,
  requireTee,
  teeOptions
} from "@/lib/tees";
import { buildRoundEntryTeeSnapshot } from "@/lib/round-service";

test("tee order is farthest to forward with Green as the default", () => {
  assert.deepEqual(teeOptions, ["BLACK", "GREEN", "YELLOW", "WHITE"]);
  assert.equal(defaultTee, "GREEN");
  assert.equal(normalizeTee(null), "GREEN");
  assert.equal(normalizeTee(undefined), "GREEN");
});

test("moving forward adds two quota points per tee", () => {
  assert.equal(calculateTeeAdjustment("GREEN", "YELLOW"), 2);
  assert.equal(calculateTeeAdjustment("GREEN", "WHITE"), 4);
  assert.equal(calculateAdjustedQuota(34, "GREEN", "WHITE"), 38);
});

test("moving back subtracts two quota points per tee", () => {
  assert.equal(calculateTeeAdjustment("GREEN", "BLACK"), -2);
  assert.equal(calculateTeeAdjustment("WHITE", "BLACK"), -6);
  assert.equal(calculateAdjustedQuota(34, "WHITE", "BLACK"), 28);
});

test("tee movement clamps at the course endpoints", () => {
  assert.equal(moveTeeBack("BLACK"), "BLACK");
  assert.equal(moveTeeBack("GREEN"), "BLACK");
  assert.equal(moveTeeForward("GREEN"), "YELLOW");
  assert.equal(moveTeeForward("WHITE"), "WHITE");
});

test("tee adjustment display is explicit for setup review", () => {
  assert.equal(formatTeeAdjustment(0), "0");
  assert.equal(formatTeeAdjustment(2), "+2");
  assert.equal(formatTeeAdjustment(-2), "-2");
});

test("invalid tees are rejected instead of silently normalized", () => {
  assert.throws(() => requireTee("BLUE", "Default tee"), /Default tee must be Black, Green, Yellow, or White/);
});

test("round entry tee snapshot separates base quota, tee adjustment, and adjusted start quota", () => {
  assert.deepEqual(
    buildRoundEntryTeeSnapshot({
      baseQuota: 34,
      defaultPlayerTee: "GREEN",
      playingTee: "WHITE"
    }),
    {
      defaultTeeSnapshot: "GREEN",
      playingTee: "WHITE",
      baseQuota: 34,
      teeAdjustment: 4,
      startQuota: 38
    }
  );
});

test("round entry tee snapshot defaults the playing tee to the player's default tee", () => {
  assert.deepEqual(
    buildRoundEntryTeeSnapshot({
      baseQuota: 34,
      defaultPlayerTee: "BLACK"
    }),
    {
      defaultTeeSnapshot: "BLACK",
      playingTee: "BLACK",
      baseQuota: 34,
      teeAdjustment: 0,
      startQuota: 34
    }
  );
});

test("tee-adjusted par round does not copy tee adjustment into permanent quota", () => {
  assert.deepEqual(calculateNextQuota(24, 24, 22), {
    plusMinus: 0,
    nextQuota: 22
  });
});

test("tee-adjusted positive round applies earned movement to the base quota", () => {
  assert.deepEqual(calculateNextQuota(24, 26, 22), {
    plusMinus: 2,
    nextQuota: 24
  });
});

test("tee-adjusted negative round applies earned movement to the base quota", () => {
  assert.deepEqual(calculateNextQuota(24, 20, 22), {
    plusMinus: -4,
    nextQuota: 21
  });
});

test("quota history rebuild uses adjusted quota for result and base quota for permanent movement", () => {
  const rebuilt = rebuildPlayerQuotaHistory({
    baselineQuota: 22,
    rounds: [
      {
        roundId: "round-1",
        roundName: "Tee Test",
        roundDate: "2026-07-21T12:00:00.000Z",
        totalPoints: 24,
        startQuota: 24,
        baseQuota: 22,
        teeAdjustment: 2,
        plusMinus: 0,
        nextQuota: 22
      },
      {
        roundId: "round-2",
        roundName: "Tee Test 2",
        roundDate: "2026-07-22T12:00:00.000Z",
        totalPoints: 26,
        startQuota: 24,
        baseQuota: 22,
        teeAdjustment: 2,
        plusMinus: 2,
        nextQuota: 24
      }
    ]
  });

  assert.deepEqual(
    rebuilt.roundsAscending.map((round) => ({
      baseQuota: round.baseQuota,
      startQuota: round.startQuota,
      plusMinus: round.plusMinus,
      quotaMovement: round.quotaMovement,
      nextQuota: round.nextQuota
    })),
    [
      { baseQuota: 22, startQuota: 24, plusMinus: 0, quotaMovement: 0, nextQuota: 22 },
      { baseQuota: 22, startQuota: 24, plusMinus: 2, quotaMovement: 2, nextQuota: 24 }
    ]
  );
});

test("tee migration explicitly backfills historical baseQuota from startQuota", () => {
  const migrationSql = readFileSync(
    "prisma/migrations/20260721170000_add_tee_selection/migration.sql",
    "utf8"
  );

  assert.match(migrationSql, /"baseQuota" = "startQuota"/);
  assert.doesNotMatch(migrationSql, /SET\s+"baseQuota"\s*=\s*0/i);
});
