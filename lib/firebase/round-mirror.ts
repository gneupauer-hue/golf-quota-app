import { createHash } from "node:crypto";
import { normalizePlayerName, resolveOperationalCurrentQuota } from "@/lib/firebase/player-mirror";
import type {
  FirebaseActiveRoundPointerMirror,
  FirebaseRoundEntryMirror,
  FirebaseRoundMirror,
  FirebaseRoundMirrorMode,
  FirebaseRoundMirrorStatus,
  FirebaseRoundScoringEntryMode,
  FirebaseRoundTeamCode
} from "@/lib/firebase/types";

export const FIREBASE_ROUND_MIRROR_SETUP_VERSION = 1;
export const FIREBASE_ROUND_MIRROR_MIGRATION_PHASE = 3 as const;

const TEAM_CODES = new Set(["A", "B", "C", "D", "E"]);
const SCORE_FIELD_NAMES = new Set([
  "frontSubmittedAt",
  "backSubmittedAt",
  "quickFrontNine",
  "quickBackNine",
  "birdieHolesCsv",
  "birdieHoles",
  "frontNine",
  "backNine",
  "totalPoints",
  "frontPlusMinus",
  "backPlusMinus",
  "plusMinus",
  "nextQuota",
  "rank",
  ...Array.from({ length: 18 }, (_, index) => `hole${index + 1}`),
  "holes",
  "holeScores"
]);

export type PrismaRoundMirrorEntryInput = {
  id: string;
  playerId: string;
  playerName?: string | null;
  player?: {
    id?: string;
    name: string;
    quota?: number | null;
    currentQuota?: number | null;
    startingQuota: number;
    isActive: boolean;
    isRegular: boolean;
  };
  startQuota: number;
  currentQuota?: number | null;
  team?: string | null;
  groupNumber?: number | null;
  teeTime?: string | null;
};

export type PrismaRoundMirrorInput = {
  id: string;
  roundName: string;
  roundDate: Date | string;
  roundMode: string;
  scoringEntryMode: string;
  isTestRound: boolean;
  teamCount?: number | null;
  notes?: string | null;
  createdAt: Date | string;
  updatedAt?: Date | string | null;
  canceledAt?: Date | string | null;
  completedAt?: Date | string | null;
  lockedAt?: Date | string | null;
  startedAt?: Date | string | null;
  entries: PrismaRoundMirrorEntryInput[];
};

export type RoundMirrorMappingResult = {
  roundId: string;
  round: FirebaseRoundMirror;
  entries: FirebaseRoundEntryMirror[];
  activePointer: FirebaseActiveRoundPointerMirror;
};

export type FirestoreRoundMirrorComparisonInput = {
  docId?: string;
  prismaRoundId?: string;
  checksum?: string;
};

export type FirestoreRoundEntryMirrorComparisonInput = {
  docId?: string;
  prismaPlayerId?: string;
  checksum?: string;
};

export type FirestoreActiveRoundPointerComparisonInput = {
  roundId?: string;
  prismaRoundId?: string;
  checksum?: string;
};

export type MirrorAuditSectionResult = {
  counts: {
    created: number;
    updated: number;
    unchanged: number;
    extra: number;
  };
  createdIds: string[];
  updatedIds: string[];
  unchangedIds: string[];
  extraIds: string[];
};

export type RoundMirrorAuditResult = {
  round: MirrorAuditSectionResult;
  entries: MirrorAuditSectionResult;
  activePointer: MirrorAuditSectionResult;
};

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

function toIsoString(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date value in round mirror input.");
  }
  return date.toISOString();
}

function validateFiniteQuota(value: number, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
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

function normalizeTeam(value: string | null | undefined): FirebaseRoundTeamCode | null {
  if (value == null || value === "") {
    return null;
  }
  if (TEAM_CODES.has(value)) {
    return value as FirebaseRoundTeamCode;
  }
  throw new Error("Team must be A, B, C, D, or E.");
}

function normalizeGroupNumber(value: number | null | undefined) {
  if (value == null) {
    return null;
  }
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("Group number must be a positive integer.");
  }
  return value;
}

function assertNoScoreFields(entry: PrismaRoundMirrorEntryInput) {
  const keys = Object.keys(entry as Record<string, unknown>);
  const disallowed = keys.find((key) => SCORE_FIELD_NAMES.has(key));
  if (disallowed) {
    throw new Error(`Round setup mirror input must not include score field ${disallowed}.`);
  }
}

export function mapPrismaRoundStatus(round: Pick<
  PrismaRoundMirrorInput,
  "canceledAt" | "completedAt" | "lockedAt" | "startedAt"
>): FirebaseRoundMirrorStatus {
  if (round.canceledAt) return "canceled";
  if (round.completedAt) return "posted";
  if (round.lockedAt) return "locked";
  if (round.startedAt) return "active";
  return "setup";
}

export function buildRoundMirrorChecksumInput(round: Omit<FirebaseRoundMirror, "checksum">) {
  return {
    prismaRoundId: round.prismaRoundId,
    roundName: round.roundName,
    roundDate: round.roundDate,
    roundMode: round.roundMode,
    scoringEntryMode: round.scoringEntryMode,
    isTestRound: round.isTestRound,
    status: round.status,
    teamCount: round.teamCount,
    notes: round.notes,
    setupVersion: round.setupVersion,
    source: round.source,
    migrationPhase: round.migrationPhase,
    prismaCreatedAt: round.prismaCreatedAt,
    prismaUpdatedAt: round.prismaUpdatedAt,
    createdByUid: round.createdByUid,
    updatedByUid: round.updatedByUid
  };
}

export function buildRoundEntryMirrorChecksumInput(entry: Omit<FirebaseRoundEntryMirror, "checksum">) {
  return {
    prismaEntryId: entry.prismaEntryId,
    prismaPlayerId: entry.prismaPlayerId,
    playerName: entry.playerName,
    normalizedName: entry.normalizedName,
    startQuota: entry.startQuota,
    currentQuota: entry.currentQuota,
    team: entry.team,
    groupNumber: entry.groupNumber,
    teeTime: entry.teeTime,
    sortOrder: entry.sortOrder,
    isActive: entry.isActive,
    isRegular: entry.isRegular,
    setupVersion: entry.setupVersion
  };
}

export function buildActiveRoundPointerChecksumInput(pointer: Omit<FirebaseActiveRoundPointerMirror, "checksum">) {
  return {
    roundId: pointer.roundId,
    prismaRoundId: pointer.prismaRoundId,
    status: pointer.status
  };
}

function sortEntriesForMirror(entries: Array<Omit<FirebaseRoundEntryMirror, "sortOrder" | "checksum">>) {
  return [...entries].sort((left, right) => {
    const leftGroup = left.groupNumber ?? Number.MAX_SAFE_INTEGER;
    const rightGroup = right.groupNumber ?? Number.MAX_SAFE_INTEGER;
    return (
      leftGroup - rightGroup ||
      (left.teeTime ?? "").localeCompare(right.teeTime ?? "") ||
      (left.team ?? "").localeCompare(right.team ?? "") ||
      left.playerName.localeCompare(right.playerName) ||
      left.prismaPlayerId.localeCompare(right.prismaPlayerId)
    );
  });
}

export function mapPrismaRoundToFirebaseMirror(round: PrismaRoundMirrorInput): RoundMirrorMappingResult {
  if (!round.id?.trim()) {
    throw new Error("Prisma round ID is required.");
  }

  const seenPlayerIds = new Set<string>();
  const baseEntries = round.entries.map((entry) => {
    assertNoScoreFields(entry);

    const prismaPlayerId = entry.playerId || entry.player?.id;
    if (!prismaPlayerId?.trim()) {
      throw new Error("Round entry player ID is required.");
    }
    if (seenPlayerIds.has(prismaPlayerId)) {
      throw new Error(`Duplicate round entry player ID: ${prismaPlayerId}.`);
    }
    seenPlayerIds.add(prismaPlayerId);

    const playerName = entry.playerName ?? entry.player?.name;
    if (!playerName?.trim()) {
      throw new Error(`Player name is required for ${prismaPlayerId}.`);
    }

    validateFiniteQuota(entry.startQuota, "Round start quota");
    const currentQuota =
      entry.currentQuota ??
      (entry.player
        ? resolveOperationalCurrentQuota(entry.player)
        : entry.startQuota);
    validateFiniteQuota(currentQuota, "Operational current quota");

    return {
      prismaEntryId: entry.id,
      prismaPlayerId,
      playerName,
      normalizedName: normalizePlayerName(playerName),
      startQuota: entry.startQuota,
      currentQuota,
      team: normalizeTeam(entry.team),
      groupNumber: normalizeGroupNumber(entry.groupNumber),
      teeTime: entry.teeTime?.trim() ? entry.teeTime.trim() : null,
      isActive: entry.player?.isActive ?? true,
      isRegular: entry.player?.isRegular ?? false,
      setupVersion: FIREBASE_ROUND_MIRROR_SETUP_VERSION
    };
  });

  const entries = sortEntriesForMirror(baseEntries).map((entry, index) => {
    const withoutChecksum = {
      ...entry,
      sortOrder: index + 1
    };
    return {
      ...withoutChecksum,
      checksum: checksum(buildRoundEntryMirrorChecksumInput(withoutChecksum))
    };
  });

  const roundWithoutChecksum: Omit<FirebaseRoundMirror, "checksum"> = {
    prismaRoundId: round.id,
    roundName: round.roundName,
    roundDate: toIsoString(round.roundDate),
    roundMode: normalizeRoundMode(round.roundMode),
    scoringEntryMode: normalizeScoringEntryMode(round.scoringEntryMode),
    isTestRound: Boolean(round.isTestRound),
    status: mapPrismaRoundStatus(round),
    teamCount: round.teamCount ?? null,
    notes: round.notes?.trim() ? round.notes.trim() : null,
    setupVersion: FIREBASE_ROUND_MIRROR_SETUP_VERSION,
    source: "prisma",
    migrationPhase: FIREBASE_ROUND_MIRROR_MIGRATION_PHASE,
    prismaCreatedAt: toIsoString(round.createdAt),
    prismaUpdatedAt: toIsoString(round.updatedAt ?? round.createdAt),
    createdByUid: null,
    updatedByUid: null
  };
  const roundMirror = {
    ...roundWithoutChecksum,
    checksum: checksum(buildRoundMirrorChecksumInput(roundWithoutChecksum))
  };
  const activePointerWithoutChecksum: Omit<FirebaseActiveRoundPointerMirror, "checksum"> = {
    roundId: round.id,
    prismaRoundId: round.id,
    status: roundMirror.status
  };

  return {
    roundId: round.id,
    round: roundMirror,
    entries,
    activePointer: {
      ...activePointerWithoutChecksum,
      checksum: checksum(buildActiveRoundPointerChecksumInput(activePointerWithoutChecksum))
    }
  };
}

function emptyAuditSection(): MirrorAuditSectionResult {
  return {
    counts: { created: 0, updated: 0, unchanged: 0, extra: 0 },
    createdIds: [],
    updatedIds: [],
    unchangedIds: [],
    extraIds: []
  };
}

function finalizeAuditSection(section: MirrorAuditSectionResult) {
  section.createdIds.sort((left, right) => left.localeCompare(right));
  section.updatedIds.sort((left, right) => left.localeCompare(right));
  section.unchangedIds.sort((left, right) => left.localeCompare(right));
  section.extraIds.sort((left, right) => left.localeCompare(right));
  section.counts.created = section.createdIds.length;
  section.counts.updated = section.updatedIds.length;
  section.counts.unchanged = section.unchangedIds.length;
  section.counts.extra = section.extraIds.length;
  return section;
}

function auditOne(
  expectedId: string,
  expectedChecksum: string,
  existing: { id: string; checksum?: string } | null | undefined
) {
  const section = emptyAuditSection();
  if (!existing) {
    section.createdIds.push(expectedId);
  } else if (existing.checksum === expectedChecksum) {
    section.unchangedIds.push(expectedId);
  } else {
    section.updatedIds.push(expectedId);
  }
  return finalizeAuditSection(section);
}

export function auditFirebaseRoundMirror(
  expected: RoundMirrorMappingResult,
  firestore: {
    round?: FirestoreRoundMirrorComparisonInput | null;
    entries?: FirestoreRoundEntryMirrorComparisonInput[];
    activePointer?: FirestoreActiveRoundPointerComparisonInput | null;
  }
): RoundMirrorAuditResult {
  const entrySection = emptyAuditSection();
  const firestoreEntriesByPlayerId = new Map(
    (firestore.entries ?? [])
      .filter(
        (entry): entry is FirestoreRoundEntryMirrorComparisonInput & { prismaPlayerId: string } =>
          typeof entry.prismaPlayerId === "string"
      )
      .map((entry) => [entry.prismaPlayerId, entry])
  );
  const expectedEntryIds = new Set(expected.entries.map((entry) => entry.prismaPlayerId));

  for (const entry of expected.entries) {
    const existing = firestoreEntriesByPlayerId.get(entry.prismaPlayerId);
    if (!existing) {
      entrySection.createdIds.push(entry.prismaPlayerId);
    } else if (existing.checksum === entry.checksum) {
      entrySection.unchangedIds.push(entry.prismaPlayerId);
    } else {
      entrySection.updatedIds.push(entry.prismaPlayerId);
    }
  }

  for (const entry of firestore.entries ?? []) {
    if (typeof entry.prismaPlayerId === "string" && !expectedEntryIds.has(entry.prismaPlayerId)) {
      entrySection.extraIds.push(entry.prismaPlayerId);
    }
  }

  const roundExisting = firestore.round
    ? {
        id: firestore.round.prismaRoundId ?? firestore.round.docId ?? "",
        checksum: firestore.round.checksum
      }
    : null;
  const activePointerExisting = firestore.activePointer
    ? {
        id: firestore.activePointer.roundId ?? firestore.activePointer.prismaRoundId ?? "",
        checksum: firestore.activePointer.checksum
      }
    : null;
  const roundAudit = auditOne(expected.round.prismaRoundId, expected.round.checksum, roundExisting);
  const activePointerAudit = auditOne(
    expected.activePointer.roundId,
    expected.activePointer.checksum,
    activePointerExisting
  );

  if (roundExisting && roundExisting.id !== expected.round.prismaRoundId) {
    roundAudit.createdIds.push(expected.round.prismaRoundId);
    roundAudit.updatedIds = [];
    roundAudit.unchangedIds = [];
    roundAudit.extraIds.push(roundExisting.id);
    finalizeAuditSection(roundAudit);
  }

  if (activePointerExisting && activePointerExisting.id !== expected.activePointer.roundId) {
    activePointerAudit.updatedIds = [expected.activePointer.roundId];
    activePointerAudit.createdIds = [];
    activePointerAudit.unchangedIds = [];
    activePointerAudit.extraIds = [];
    finalizeAuditSection(activePointerAudit);
  }

  return {
    round: roundAudit,
    entries: finalizeAuditSection(entrySection),
    activePointer: activePointerAudit
  };
}
