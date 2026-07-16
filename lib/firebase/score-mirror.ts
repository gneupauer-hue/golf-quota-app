import { createHash } from "node:crypto";
import { holeFieldNames, holeScoreValues, parseGoodSkinEntriesInput } from "@/lib/quota";
import type {
  FirebaseRoundMirrorMode,
  FirebaseRoundScoringEntryMode,
  FirebaseScoreGoodSkinEntry,
  FirebaseScoreHoles,
  FirebaseScoreMirror
} from "@/lib/firebase/types";

export const FIREBASE_SCORE_MIRROR_VERSION = 1 as const;

type HoleFieldName = (typeof holeFieldNames)[number];

export type PrismaScoreMirrorEntryInput = Record<HoleFieldName, number | null> & {
  id: string;
  playerId: string;
  playerName?: string | null;
  quickFrontNine?: number | null;
  quickBackNine?: number | null;
  frontSubmittedAt?: Date | string | null;
  backSubmittedAt?: Date | string | null;
  birdieHolesCsv?: string | null;
};

export type PrismaScoreMirrorRoundInput = {
  id: string;
  roundMode: string;
  scoringEntryMode: string;
  entries: PrismaScoreMirrorEntryInput[];
};

export type ScoreMirrorMappingResult = {
  roundId: string;
  scores: FirebaseScoreMirror[];
  playerNamesById: Record<string, string | null>;
};

export type FirestoreScoreMirrorComparisonInput = {
  docId?: string;
  prismaPlayerId?: string;
  checksum?: string;
  playerName?: string | null;
};

export type ScoreMirrorAuditItem = {
  playerId: string;
  playerName: string | null;
};

export type ScoreMirrorAuditResult = {
  counts: {
    created: number;
    updated: number;
    unchanged: number;
    extra: number;
  };
  created: ScoreMirrorAuditItem[];
  updated: ScoreMirrorAuditItem[];
  unchanged: ScoreMirrorAuditItem[];
  extra: ScoreMirrorAuditItem[];
};

const VALID_HOLE_SCORE_VALUES = new Set<number>(holeScoreValues);
const SCORE_RESULT_FIELD_NAMES = new Set([
  "frontQuota",
  "backQuota",
  "frontNine",
  "backNine",
  "frontPlusMinus",
  "backPlusMinus",
  "totalPoints",
  "plusMinus",
  "nextQuota",
  "rank",
  "payout",
  "payoutAmount",
  "skinsPayout",
  "individualPayout"
]);

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableStringify(nestedValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function checksum(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function normalizeRoundMode(value: string): FirebaseRoundMirrorMode {
  if (value === "MATCH_QUOTA" || value === "SKINS_ONLY") {
    return value;
  }
  throw new Error("Round mode must be MATCH_QUOTA or SKINS_ONLY.");
}

function normalizeScoringEntryMode(value: string): FirebaseRoundScoringEntryMode {
  if (value === "QUICK" || value === "DETAILED") {
    return value;
  }
  throw new Error("Scoring entry mode must be QUICK or DETAILED.");
}

function toIsoStringOrNull(value: Date | string | null | undefined, label: string) {
  if (value == null) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid date.`);
  }
  return date.toISOString();
}

function validateHoleScore(value: number | null, label: string) {
  if (value !== null && !VALID_HOLE_SCORE_VALUES.has(value)) {
    throw new Error(`${label} must be one of -1, 0, 1, 2, 4, or 6.`);
  }
}

function validateQuickScore(value: number | null, label: string) {
  if (value !== null && (!Number.isInteger(value) || value < -9 || value > 54)) {
    throw new Error(`${label} must be a whole-number point total.`);
  }
}

function normalizeHoleValue(value: number | null | undefined, label: string) {
  const normalized = value ?? null;
  validateHoleScore(normalized, label);
  return normalized;
}

export function buildScoreHoles(entry: Record<HoleFieldName, number | null>): FirebaseScoreHoles {
  return Object.fromEntries(
    holeFieldNames.map((fieldName, index) => [
      String(index + 1),
      normalizeHoleValue(entry[fieldName], `Hole ${index + 1}`)
    ])
  ) as FirebaseScoreHoles;
}

function normalizeGoodSkinEntries(value: string | null | undefined): FirebaseScoreGoodSkinEntry[] {
  return parseGoodSkinEntriesInput(value ?? "").map((entry) => ({
    holeNumber: entry.holeNumber,
    type: entry.type,
    score: entry.score
  }));
}

function assertNoResultFields(entry: PrismaScoreMirrorEntryInput) {
  const disallowed = Object.keys(entry as Record<string, unknown>).find((key) => SCORE_RESULT_FIELD_NAMES.has(key));
  if (disallowed) {
    throw new Error(`Score mirror input must not include derived result field ${disallowed}.`);
  }
}

export function buildScoreMirrorChecksumInput(score: Omit<FirebaseScoreMirror, "checksum">) {
  return {
    prismaRoundId: score.prismaRoundId,
    prismaEntryId: score.prismaEntryId,
    prismaPlayerId: score.prismaPlayerId,
    scoringEntryMode: score.scoringEntryMode,
    roundMode: score.roundMode,
    holes: score.holes,
    quickFrontNine: score.quickFrontNine,
    quickBackNine: score.quickBackNine,
    frontSubmittedAt: score.frontSubmittedAt,
    backSubmittedAt: score.backSubmittedAt,
    birdieHoles: score.birdieHoles,
    source: score.source,
    scoreVersion: score.scoreVersion
  };
}

function mapEntryToScoreMirror(
  round: {
    id: string;
    roundMode: FirebaseRoundMirrorMode;
    scoringEntryMode: FirebaseRoundScoringEntryMode;
  },
  entry: PrismaScoreMirrorEntryInput
): FirebaseScoreMirror {
  assertNoResultFields(entry);

  if (!entry.id?.trim()) {
    throw new Error("Prisma round entry ID is required.");
  }
  if (!entry.playerId?.trim()) {
    throw new Error("Prisma player ID is required.");
  }

  const quickFrontNine = entry.quickFrontNine ?? null;
  const quickBackNine = entry.quickBackNine ?? null;
  validateQuickScore(quickFrontNine, "Front nine");
  validateQuickScore(quickBackNine, "Back nine");

  const withoutChecksum: Omit<FirebaseScoreMirror, "checksum"> = {
    prismaRoundId: round.id,
    prismaEntryId: entry.id,
    prismaPlayerId: entry.playerId,
    scoringEntryMode: round.scoringEntryMode,
    roundMode: round.roundMode,
    holes: buildScoreHoles(entry),
    quickFrontNine,
    quickBackNine,
    frontSubmittedAt: toIsoStringOrNull(entry.frontSubmittedAt, "Front submission timestamp"),
    backSubmittedAt: toIsoStringOrNull(entry.backSubmittedAt, "Back submission timestamp"),
    birdieHoles: normalizeGoodSkinEntries(entry.birdieHolesCsv),
    source: "prisma",
    scoreVersion: FIREBASE_SCORE_MIRROR_VERSION
  };

  return {
    ...withoutChecksum,
    checksum: checksum(buildScoreMirrorChecksumInput(withoutChecksum))
  };
}

export function mapPrismaScoresToFirebaseMirror(round: PrismaScoreMirrorRoundInput): ScoreMirrorMappingResult {
  if (!round.id?.trim()) {
    throw new Error("Prisma round ID is required.");
  }

  const roundModes = {
    id: round.id,
    roundMode: normalizeRoundMode(round.roundMode),
    scoringEntryMode: normalizeScoringEntryMode(round.scoringEntryMode)
  };
  const seenPlayerIds = new Set<string>();
  const playerNamesById: Record<string, string | null> = {};
  const scores = round.entries.map((entry) => {
    if (seenPlayerIds.has(entry.playerId)) {
      throw new Error(`Duplicate score entry player ID: ${entry.playerId}.`);
    }
    seenPlayerIds.add(entry.playerId);
    playerNamesById[entry.playerId] = entry.playerName?.trim() || null;
    return mapEntryToScoreMirror(roundModes, entry);
  });

  scores.sort((left, right) => left.prismaPlayerId.localeCompare(right.prismaPlayerId));

  return {
    roundId: round.id,
    scores,
    playerNamesById
  };
}

function makeAuditItem(playerId: string, names: Record<string, string | null>, fallbackName?: string | null): ScoreMirrorAuditItem {
  return {
    playerId,
    playerName: names[playerId] ?? fallbackName ?? null
  };
}

function sortAuditItems(items: ScoreMirrorAuditItem[]) {
  return items.sort((left, right) => left.playerId.localeCompare(right.playerId));
}

export function auditFirebaseScoreMirror(
  expected: ScoreMirrorMappingResult | FirebaseScoreMirror[],
  firestoreScores: FirestoreScoreMirrorComparisonInput[]
): ScoreMirrorAuditResult {
  const scores = Array.isArray(expected) ? expected : expected.scores;
  const playerNamesById = Array.isArray(expected) ? {} : expected.playerNamesById;
  const firestoreByPlayerId = new Map(
    firestoreScores
      .filter((score): score is FirestoreScoreMirrorComparisonInput & { prismaPlayerId: string } => typeof score.prismaPlayerId === "string")
      .map((score) => [score.prismaPlayerId, score])
  );
  const expectedPlayerIds = new Set(scores.map((score) => score.prismaPlayerId));
  const created: ScoreMirrorAuditItem[] = [];
  const updated: ScoreMirrorAuditItem[] = [];
  const unchanged: ScoreMirrorAuditItem[] = [];
  const extra: ScoreMirrorAuditItem[] = [];

  for (const score of scores) {
    const existing = firestoreByPlayerId.get(score.prismaPlayerId);
    const item = makeAuditItem(score.prismaPlayerId, playerNamesById);
    if (!existing) {
      created.push(item);
    } else if (existing.checksum === score.checksum) {
      unchanged.push(item);
    } else {
      updated.push(item);
    }
  }

  for (const score of firestoreScores) {
    const playerId = score.prismaPlayerId ?? score.docId;
    if (typeof playerId === "string" && !expectedPlayerIds.has(playerId)) {
      extra.push(makeAuditItem(playerId, playerNamesById, score.playerName));
    }
  }

  sortAuditItems(created);
  sortAuditItems(updated);
  sortAuditItems(unchanged);
  sortAuditItems(extra);

  return {
    counts: {
      created: created.length,
      updated: updated.length,
      unchanged: unchanged.length,
      extra: extra.length
    },
    created,
    updated,
    unchanged,
    extra
  };
}
