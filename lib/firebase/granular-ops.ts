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
