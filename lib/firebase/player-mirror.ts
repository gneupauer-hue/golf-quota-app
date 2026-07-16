import { createHash } from "node:crypto";
import type { FirebasePlayerMirror } from "@/lib/firebase/types";

export const FIREBASE_PLAYER_MIRROR_SYNC_VERSION = 1;

export type PrismaPlayerMirrorInput = {
  id: string;
  name: string;
  quota?: number | null;
  currentQuota?: number | null;
  startingQuota: number;
  isActive: boolean;
  isRegular: boolean;
  updatedAt: Date | string;
  conflictsFrom?: Array<{ conflictPlayerId: string }>;
  _count?: {
    roundEntries?: number;
  };
};

export type FirestorePlayerMirrorComparisonInput = {
  docId?: string;
  prismaPlayerId?: string;
  checksum?: string;
};

export type PlayerMirrorAuditResult = {
  counts: {
    created: number;
    updated: number;
    unchanged: number;
    extra: number;
  };
  createdPlayerIds: string[];
  updatedPlayerIds: string[];
  unchangedPlayerIds: string[];
  extraPlayerIds: string[];
};

export function normalizePlayerName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function resolveOperationalCurrentQuota(player: {
  currentQuota?: number | null;
  quota?: number | null;
  startingQuota: number;
}) {
  return player.currentQuota ?? player.quota ?? player.startingQuota;
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function sortedUnique(values: string[]) {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

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

export function buildPlayerMirrorChecksumInput(
  player: Omit<FirebasePlayerMirror, "checksum">
) {
  return {
    prismaPlayerId: player.prismaPlayerId,
    name: player.name,
    normalizedName: player.normalizedName,
    isActive: player.isActive,
    isRegular: player.isRegular,
    currentQuota: player.currentQuota,
    startingQuota: player.startingQuota,
    storedQuota: player.storedQuota,
    finalizedNonTestRoundCount: player.finalizedNonTestRoundCount,
    conflictPlayerIds: player.conflictPlayerIds,
    source: player.source,
    prismaUpdatedAt: player.prismaUpdatedAt,
    syncVersion: player.syncVersion
  };
}

export function calculatePlayerMirrorChecksum(
  player: Omit<FirebasePlayerMirror, "checksum">
) {
  return createHash("sha256")
    .update(stableStringify(buildPlayerMirrorChecksumInput(player)))
    .digest("hex");
}

export function mapPrismaPlayerToFirebaseMirror(
  player: PrismaPlayerMirrorInput
): FirebasePlayerMirror {
  const conflictPlayerIds = sortedUnique(
    (player.conflictsFrom ?? [])
      .map((conflict) => conflict.conflictPlayerId)
      .filter((conflictPlayerId) => conflictPlayerId !== player.id)
  );
  const mirrorWithoutChecksum: Omit<FirebasePlayerMirror, "checksum"> = {
    prismaPlayerId: player.id,
    name: player.name,
    normalizedName: normalizePlayerName(player.name),
    isActive: player.isActive,
    isRegular: player.isRegular,
    currentQuota: resolveOperationalCurrentQuota(player),
    startingQuota: player.startingQuota,
    storedQuota: player.quota ?? null,
    finalizedNonTestRoundCount: player._count?.roundEntries ?? 0,
    conflictPlayerIds,
    source: "prisma",
    prismaUpdatedAt: toIsoString(player.updatedAt),
    syncVersion: FIREBASE_PLAYER_MIRROR_SYNC_VERSION
  };

  return {
    ...mirrorWithoutChecksum,
    checksum: calculatePlayerMirrorChecksum(mirrorWithoutChecksum)
  };
}

export function auditFirebasePlayerMirror(
  prismaPlayers: FirebasePlayerMirror[],
  firestorePlayers: FirestorePlayerMirrorComparisonInput[]
): PlayerMirrorAuditResult {
  const firestoreByPlayerId = new Map(
    firestorePlayers
      .filter(
        (player): player is FirestorePlayerMirrorComparisonInput & { prismaPlayerId: string } =>
          typeof player.prismaPlayerId === "string"
      )
      .map((player) => [player.prismaPlayerId, player])
  );
  const prismaPlayerIds = new Set(prismaPlayers.map((player) => player.prismaPlayerId));
  const result: PlayerMirrorAuditResult = {
    counts: {
      created: 0,
      updated: 0,
      unchanged: 0,
      extra: 0
    },
    createdPlayerIds: [],
    updatedPlayerIds: [],
    unchangedPlayerIds: [],
    extraPlayerIds: []
  };

  for (const player of prismaPlayers) {
    const existing = firestoreByPlayerId.get(player.prismaPlayerId);

    if (!existing) {
      result.createdPlayerIds.push(player.prismaPlayerId);
    } else if (existing.checksum === player.checksum) {
      result.unchangedPlayerIds.push(player.prismaPlayerId);
    } else {
      result.updatedPlayerIds.push(player.prismaPlayerId);
    }
  }

  for (const player of firestorePlayers) {
    if (typeof player.prismaPlayerId === "string" && !prismaPlayerIds.has(player.prismaPlayerId)) {
      result.extraPlayerIds.push(player.prismaPlayerId);
    }
  }

  result.createdPlayerIds.sort((left, right) => left.localeCompare(right));
  result.updatedPlayerIds.sort((left, right) => left.localeCompare(right));
  result.unchangedPlayerIds.sort((left, right) => left.localeCompare(right));
  result.extraPlayerIds.sort((left, right) => left.localeCompare(right));
  result.counts.created = result.createdPlayerIds.length;
  result.counts.updated = result.updatedPlayerIds.length;
  result.counts.unchanged = result.unchangedPlayerIds.length;
  result.counts.extra = result.extraPlayerIds.length;

  return result;
}
