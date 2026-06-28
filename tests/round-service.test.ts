import test from "node:test";
import assert from "node:assert/strict";
import { shouldSkipQuotaProgression } from "@/lib/round-service";
import { validateRoundPostingPreflightDto } from "@/lib/round-preflight";

const roundDate = new Date("2026-06-27T12:00:00.000Z");
const submittedAt = new Date("2026-06-27T20:00:00.000Z");

function buildEntry(overrides: Partial<Parameters<typeof validateRoundPostingPreflightDto>[0]["entries"][number]> = {}) {
  return {
    playerId: "player-1",
    player: { name: "Player One" },
    team: "A",
    groupNumber: 1,
    startQuota: 20,
    quickFrontNine: 14,
    quickBackNine: 13,
    frontSubmittedAt: submittedAt,
    backSubmittedAt: submittedAt,
    totalPoints: 27,
    plusMinus: 7,
    nextQuota: 21,
    birdieHolesCsv: "",
    ...overrides
  };
}

function buildRound(overrides: Partial<Parameters<typeof validateRoundPostingPreflightDto>[0]> = {}) {
  return {
    id: "round-1",
    roundName: "Test Round",
    roundMode: "MATCH_QUOTA",
    scoringEntryMode: "QUICK",
    isTestRound: false,
    roundDate,
    createdAt: roundDate,
    completedAt: null,
    canceledAt: null,
    entries: [buildEntry()],
    ...overrides
  };
}

test("test rounds never affect quota progression", () => {
  assert.equal(
    shouldSkipQuotaProgression({ roundMode: "MATCH_QUOTA", isTestRound: true }),
    true
  );
});

test("individual quota plus skins rounds affect quota progression", () => {
  assert.equal(
    shouldSkipQuotaProgression({ roundMode: "SKINS_ONLY", isTestRound: false }),
    false
  );
});

test("normal match rounds still affect quota progression", () => {
  assert.equal(
    shouldSkipQuotaProgression({ roundMode: "MATCH_QUOTA", isTestRound: false }),
    false
  );
});

test("round posting preflight allows complete quick-entry match scores", () => {
  const result = validateRoundPostingPreflightDto(buildRound());

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.summary.playerCount, 1);
  assert.equal(result.summary.submittedScoreCount, 1);
  assert.equal(result.summary.skinEntryCount, 0);
  assert.equal(result.backupSnapshot?.entries[0]?.quickFrontNine, 14);
});

test("round posting preflight reports missing player scores", () => {
  const result = validateRoundPostingPreflightDto(
    buildRound({
      entries: [
        buildEntry({
          quickFrontNine: null,
          quickBackNine: null,
          frontSubmittedAt: null,
          backSubmittedAt: null
        })
      ]
    })
  );

  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, "MISSING_SCORE");
  assert.equal(result.errors[0]?.message, "Missing scores: Player One");
});

test("round posting preflight reports partial front/back scores", () => {
  const result = validateRoundPostingPreflightDto(
    buildRound({
      entries: [
        buildEntry({
          quickBackNine: null,
          backSubmittedAt: null
        })
      ]
    })
  );

  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, "INCOMPLETE_SCORE");
  assert.equal(result.errors[0]?.message, "Incomplete score: Player One needs Back 9");
});

test("round posting preflight allows total-only individual quota scores", () => {
  const result = validateRoundPostingPreflightDto(
    buildRound({
      roundMode: "SKINS_ONLY",
      entries: [
        buildEntry({
          quickFrontNine: 30,
          quickBackNine: null,
          totalPoints: 30,
          plusMinus: 10,
          nextQuota: 21,
          birdieHolesCsv: "4:birdie,11:eagle,17:ace"
        })
      ]
    })
  );

  assert.equal(result.ok, true);
  assert.equal(result.summary.submittedScoreCount, 1);
  assert.equal(result.summary.skinEntryCount, 3);
});

test("round posting preflight detects duplicate player entries", () => {
  const result = validateRoundPostingPreflightDto(
    buildRound({
      entries: [
        buildEntry(),
        buildEntry({
          player: { name: "Player One Duplicate" }
        })
      ]
    })
  );

  assert.equal(result.ok, false);
  assert.equal(result.errors.some((issue) => issue.code === "DUPLICATE_PLAYER"), true);
});
