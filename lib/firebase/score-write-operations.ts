import { formatGoodSkinEntriesInput, parseGoodSkinEntriesInput, type GoodSkinEntry } from "@/lib/quota";

export type FirestoreTestScoreOperation =
  | { type: "set-hole"; holeNumber: number; value: number | null }
  | { type: "set-quick-front"; value: number | null }
  | { type: "set-quick-back"; value: number | null }
  | { type: "set-birdie-holes"; value: GoodSkinEntry[] };

export type FirestoreTestScoreOperationRow = {
  playerId: string;
  holeScores: Array<number | null>;
  quickFrontNine: number | null;
  quickBackNine: number | null;
  birdieHolesText: string;
};

export const NEXT_PUBLIC_FIREBASE_REGULAR_ROUND_SCORE_MIRROR_FLAG =
  "NEXT_PUBLIC_FIREBASE_REGULAR_ROUND_SCORE_MIRROR_ENABLED";

export function isRegularRoundScoreMirrorClientEnabled(
  value: string | undefined = process.env.NEXT_PUBLIC_FIREBASE_REGULAR_ROUND_SCORE_MIRROR_ENABLED
) {
  return value === "true";
}

export function shouldAttemptFirestoreScoreMirror(input: {
  isTestRound: boolean;
  isRoundOpenForScoring: boolean;
  signedIn: boolean;
  activeClubId: string | null;
  activeMembershipStatus: string | null | undefined;
  regularRoundClientEnabled?: boolean;
}) {
  if (
    !input.isRoundOpenForScoring ||
    !input.signedIn ||
    !input.activeClubId ||
    input.activeMembershipStatus !== "active"
  ) {
    return false;
  }

  return input.isTestRound || input.regularRoundClientEnabled === true;
}

export function cloneFirestoreTestScoreOperationRows<Row extends FirestoreTestScoreOperationRow>(rows: Row[]): Row[] {
  return rows.map((row) => ({ ...row, holeScores: [...row.holeScores] }));
}

export function buildFirestoreTestScoreOperations(
  nextRows: FirestoreTestScoreOperationRow[],
  savedRows: FirestoreTestScoreOperationRow[],
  options: { holeIndexes?: number[]; includeAllHoles?: boolean } = {}
) {
  const operations: Array<{ playerId: string; operation: FirestoreTestScoreOperation }> = [];
  const savedRowByPlayerId = new Map(savedRows.map((row) => [row.playerId, row]));

  for (const row of nextRows) {
    const savedRow = savedRowByPlayerId.get(row.playerId);

    for (const holeIndex of options.holeIndexes ?? []) {
      if (row.holeScores[holeIndex] !== savedRow?.holeScores[holeIndex]) {
        operations.push({
          playerId: row.playerId,
          operation: {
            type: "set-hole",
            holeNumber: holeIndex + 1,
            value: row.holeScores[holeIndex]
          }
        });
      }
    }

    if (!options.includeAllHoles) {
      continue;
    }

    if (row.quickFrontNine !== savedRow?.quickFrontNine) {
      operations.push({
        playerId: row.playerId,
        operation: {
          type: "set-quick-front",
          value: row.quickFrontNine
        }
      });
    }

    if (row.quickBackNine !== savedRow?.quickBackNine) {
      operations.push({
        playerId: row.playerId,
        operation: {
          type: "set-quick-back",
          value: row.quickBackNine
        }
      });
    }

    const nextBirdieHoles = formatGoodSkinEntriesInput(parseGoodSkinEntriesInput(row.birdieHolesText));
    const savedBirdieHoles = formatGoodSkinEntriesInput(parseGoodSkinEntriesInput(savedRow?.birdieHolesText ?? ""));

    if (nextBirdieHoles !== savedBirdieHoles) {
      operations.push({
        playerId: row.playerId,
        operation: {
          type: "set-birdie-holes",
          value: parseGoodSkinEntriesInput(row.birdieHolesText)
        }
      });
    }
  }

  return operations;
}
