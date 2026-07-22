import type { FirebaseScoreGoodSkinEntry } from "@/lib/firebase/types";

export type GranularScoreRetryOperation =
  | {
      type: "hole-score";
      clubId: string;
      roundId: string;
      entryId: string;
      playerId: string;
      holeNumber: number;
      score: number | null;
    }
  | {
      type: "quick-front";
      clubId: string;
      roundId: string;
      entryId: string;
      playerId: string;
      value: number | null;
    }
  | {
      type: "quick-back";
      clubId: string;
      roundId: string;
      entryId: string;
      playerId: string;
      value: number | null;
    }
  | {
      type: "skins-entry";
      clubId: string;
      roundId: string;
      entryId: string;
      playerId: string;
      value: string[];
    }
  | {
      type: "segment-submit";
      clubId: string;
      roundId: string;
      entryId: string;
      playerId: string;
      segment: "front" | "back";
    };

export function assertGranularRetryOperation(operation: GranularScoreRetryOperation) {
  if (!operation.clubId || !operation.roundId || !operation.entryId || !operation.playerId) {
    throw new Error("Granular retry operations require club, round, entry, and player ids.");
  }

  if (operation.type === "hole-score" && (!Number.isInteger(operation.holeNumber) || operation.holeNumber < 1 || operation.holeNumber > 18)) {
    throw new Error("Hole-score retry operations require one hole number from 1 to 18.");
  }
}

type ScoreOperationBase = {
  playerId: string;
  expectedVersion?: number;
};

export type FirebaseScoreGranularOperation =
  | (ScoreOperationBase & {
      type: "set-hole";
      holeNumber: number;
      value: number | null;
      expectedCurrentValue: number | null;
    })
  | (ScoreOperationBase & {
      type: "set-quick-front";
      value: number | null;
      expectedCurrentValue: number | null;
    })
  | (ScoreOperationBase & {
      type: "set-quick-back";
      value: number | null;
      expectedCurrentValue: number | null;
    })
  | (ScoreOperationBase & {
      type: "set-birdie-holes";
      value: FirebaseScoreGoodSkinEntry[];
      expectedCurrentValue: FirebaseScoreGoodSkinEntry[];
    })
  | (ScoreOperationBase & {
      type: "submit-front";
      value: string;
      expectedCurrentValue: string | null;
    })
  | (ScoreOperationBase & {
      type: "submit-back";
      value: string;
      expectedCurrentValue: string | null;
    });

function validateOperationVersion(value: number | undefined) {
  if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
    throw new Error("Granular score operations require a non-negative expected version when provided.");
  }
}

function validateOperationHoleScore(value: number | null) {
  if (value !== null && ![-1, 0, 1, 2, 4, 6, 8].includes(value)) {
    throw new Error("Hole operation values must be one of -1, 0, 1, 2, 4, 6, or 8.");
  }
}

function validateOperationQuickScore(value: number | null) {
  if (value !== null && (!Number.isInteger(value) || value < -9 || value > 54)) {
    throw new Error("Quick score operation values must be whole-number point totals.");
  }
}

function validateGoodSkinEntries(entries: FirebaseScoreGoodSkinEntry[]) {
  if (!Array.isArray(entries)) {
    throw new Error("Birdie-hole operations require an array of normalized entries.");
  }

  for (const entry of entries) {
    if (!Number.isInteger(entry.holeNumber) || entry.holeNumber < 1 || entry.holeNumber > 18) {
      throw new Error("Birdie-hole operations require hole numbers from 1 to 18.");
    }
    if (!["birdie", "eagle", "ace"].includes(entry.type)) {
      throw new Error("Birdie-hole operations require birdie, eagle, or ace entry types.");
    }
    const expectedScore = entry.type === "ace" ? 8 : entry.type === "eagle" ? 6 : 4;
    if (entry.score !== expectedScore) {
      throw new Error("Birdie-hole operation scores must match the entry type.");
    }
  }
}

function validateSubmitTimestamp(value: string) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    throw new Error("Submit operations require an ISO timestamp value.");
  }
}

export function assertFirebaseScoreGranularOperation(operation: FirebaseScoreGranularOperation) {
  if (!operation.playerId?.trim()) {
    throw new Error("Granular score operations require a player ID.");
  }
  validateOperationVersion(operation.expectedVersion);

  if (operation.type === "set-hole") {
    if (!Number.isInteger(operation.holeNumber) || operation.holeNumber < 1 || operation.holeNumber > 18) {
      throw new Error("Set-hole operations require one hole number from 1 to 18.");
    }
    validateOperationHoleScore(operation.value);
    validateOperationHoleScore(operation.expectedCurrentValue);
    return;
  }

  if (operation.type === "set-quick-front" || operation.type === "set-quick-back") {
    validateOperationQuickScore(operation.value);
    validateOperationQuickScore(operation.expectedCurrentValue);
    return;
  }

  if (operation.type === "set-birdie-holes") {
    validateGoodSkinEntries(operation.value);
    validateGoodSkinEntries(operation.expectedCurrentValue);
    return;
  }

  validateSubmitTimestamp(operation.value);
}
