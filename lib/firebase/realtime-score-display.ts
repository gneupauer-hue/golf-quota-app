import { formatGoodSkinEntriesInput } from "@/lib/quota";
import type { FirebaseScoreGoodSkinEntry, FirebaseScoreMirror } from "@/lib/firebase/types";

export type RealtimeScoreDisplayRow = {
  playerId: string;
  quickFrontNine: number | null;
  quickBackNine: number | null;
  birdieHolesText: string;
};

export type RealtimeScoreDisplayMirror = FirebaseScoreMirror & {
  lastEditedByUid?: string | null;
  lastOperationId?: string | null;
};

export type RealtimeScoreDisplayState = {
  baselineVersions: Record<string, number>;
  initialized: boolean;
};

export type RealtimeScoreDisplayResult<Row extends RealtimeScoreDisplayRow> = {
  rows: Row[];
  state: RealtimeScoreDisplayState;
  updatedPlayerIds: string[];
  conflictPlayerIds: string[];
  ignoredPlayerIds: string[];
};

function formatMirrorBirdieHoles(value: FirebaseScoreGoodSkinEntry[]) {
  return formatGoodSkinEntriesInput(
    value.map((entry) => ({
      holeNumber: entry.holeNumber,
      type: entry.type,
      score: entry.score
    }))
  );
}

export function addRecentLocalOperationId(current: string[], operationId: string, limit = 12) {
  if (!operationId.trim()) {
    return current;
  }

  return [operationId, ...current.filter((id) => id !== operationId)].slice(0, limit);
}

function isLocalOperationEcho(score: RealtimeScoreDisplayMirror, localOperationIds: Set<string>) {
  return Boolean(score.lastOperationId && localOperationIds.has(score.lastOperationId));
}

export function reconcileRealtimeQuickScoreDisplay<Row extends RealtimeScoreDisplayRow>(input: {
  rows: Row[];
  scores: RealtimeScoreDisplayMirror[];
  state: RealtimeScoreDisplayState;
  dirtyPlayerIds?: Iterable<string>;
  savingPlayerIds?: Iterable<string>;
  localOperationIds?: Iterable<string>;
}): RealtimeScoreDisplayResult<Row> {
  const baselineVersions = { ...input.state.baselineVersions };
  const dirtyPlayerIds = new Set(input.dirtyPlayerIds ?? []);
  const savingPlayerIds = new Set(input.savingPlayerIds ?? []);
  const localOperationIds = new Set(input.localOperationIds ?? []);
  const scoresByPlayerId = new Map(input.scores.map((score) => [score.prismaPlayerId, score]));
  const updatedPlayerIds: string[] = [];
  const conflictPlayerIds: string[] = [];
  const ignoredPlayerIds: string[] = [];

  if (!input.state.initialized) {
    for (const score of input.scores) {
      baselineVersions[score.prismaPlayerId] = Math.max(
        baselineVersions[score.prismaPlayerId] ?? 0,
        score.scoreVersion
      );
    }

    return {
      rows: input.rows,
      state: { baselineVersions, initialized: true },
      updatedPlayerIds,
      conflictPlayerIds,
      ignoredPlayerIds
    };
  }

  const rows = input.rows.map((row) => {
    const score = scoresByPlayerId.get(row.playerId);
    if (!score || score.scoringEntryMode !== "QUICK") {
      return row;
    }

    const baselineVersion = baselineVersions[row.playerId];
    if (baselineVersion == null) {
      baselineVersions[row.playerId] = score.scoreVersion;
      ignoredPlayerIds.push(row.playerId);
      return row;
    }

    if (score.scoreVersion <= baselineVersion) {
      ignoredPlayerIds.push(row.playerId);
      return row;
    }

    baselineVersions[row.playerId] = score.scoreVersion;

    if (savingPlayerIds.has(row.playerId)) {
      return row;
    }

    if (dirtyPlayerIds.has(row.playerId)) {
      if (!isLocalOperationEcho(score, localOperationIds)) {
        conflictPlayerIds.push(row.playerId);
      }
      return row;
    }

    const nextBirdieHolesText = formatMirrorBirdieHoles(score.birdieHoles);
    if (
      row.quickFrontNine === score.quickFrontNine &&
      row.quickBackNine === score.quickBackNine &&
      row.birdieHolesText === nextBirdieHolesText
    ) {
      ignoredPlayerIds.push(row.playerId);
      return row;
    }

    updatedPlayerIds.push(row.playerId);
    return {
      ...row,
      quickFrontNine: score.quickFrontNine,
      quickBackNine: score.quickBackNine,
      birdieHolesText: nextBirdieHolesText
    };
  });

  return {
    rows,
    state: { baselineVersions, initialized: true },
    updatedPlayerIds,
    conflictPlayerIds,
    ignoredPlayerIds
  };
}
