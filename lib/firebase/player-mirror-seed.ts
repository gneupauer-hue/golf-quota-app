import type { FirebasePlayerMirror } from "@/lib/firebase/types";
import {
  auditFirebasePlayerMirror,
  mapPrismaPlayerToFirebaseMirror,
  type FirestorePlayerMirrorComparisonInput,
  type PlayerMirrorAuditResult,
  type PrismaPlayerMirrorInput
} from "@/lib/firebase/player-mirror";

export const IREM_FIREBASE_PROJECT_ID = "irem-golf-quota-app";

export type PlayerMirrorSeedOptions = {
  clubId: string;
  confirmProductionWrite: boolean;
  expectedProjectId?: string;
  projectId: string;
  write: boolean;
};

export type PlayerMirrorSeedPlayerSummary = {
  id: string;
  name: string;
};

export type PlayerMirrorSeedResult = {
  audit: PlayerMirrorAuditResult;
  dryRun: boolean;
  projectId: string;
  clubId: string;
  players: {
    created: PlayerMirrorSeedPlayerSummary[];
    updated: PlayerMirrorSeedPlayerSummary[];
    unchanged: PlayerMirrorSeedPlayerSummary[];
    extra: PlayerMirrorSeedPlayerSummary[];
  };
  writesPlanned: number;
  writesApplied: number;
};

export type PlayerMirrorSeedAdapters = {
  verifyClub: (clubId: string) => Promise<{ id: string; name?: string | null } | null>;
  readPrismaPlayers: () => Promise<PrismaPlayerMirrorInput[]>;
  readFirestorePlayers: (clubId: string) => Promise<FirestorePlayerMirrorComparisonInput[]>;
  writePlayerMirrors?: (clubId: string, players: FirebasePlayerMirror[]) => Promise<void>;
};

function requireNonEmpty(value: string, label: string) {
  if (!value.trim()) {
    throw new Error(`${label} is required.`);
  }
}

export function assertPlayerMirrorSeedSafety(options: PlayerMirrorSeedOptions) {
  requireNonEmpty(options.projectId, "Firebase project ID");
  requireNonEmpty(options.clubId, "Club ID");

  const expectedProjectId = options.expectedProjectId ?? IREM_FIREBASE_PROJECT_ID;

  if (options.projectId !== expectedProjectId) {
    throw new Error(
      `Refusing to run against Firebase project "${options.projectId}". Expected "${expectedProjectId}".`
    );
  }

  if (options.write && options.projectId === IREM_FIREBASE_PROJECT_ID && !options.confirmProductionWrite) {
    throw new Error(
      "Production Firestore writes require --write and --confirm-production-write."
    );
  }
}

function summarizeById(players: FirebasePlayerMirror[], ids: string[]) {
  const playersById = new Map(players.map((player) => [player.prismaPlayerId, player]));

  return ids.map((id) => ({
    id,
    name: playersById.get(id)?.name ?? "(Firestore-only document)"
  }));
}

function writablePlayerMirrors(players: FirebasePlayerMirror[], audit: PlayerMirrorAuditResult) {
  const writableIds = new Set([...audit.createdPlayerIds, ...audit.updatedPlayerIds]);

  return players.filter((player) => writableIds.has(player.prismaPlayerId));
}

export async function runPlayerMirrorSeed(
  options: PlayerMirrorSeedOptions,
  adapters: PlayerMirrorSeedAdapters
): Promise<PlayerMirrorSeedResult> {
  assertPlayerMirrorSeedSafety(options);

  const club = await adapters.verifyClub(options.clubId);
  if (!club) {
    throw new Error(`Club "${options.clubId}" was not found or is not accessible.`);
  }

  const prismaPlayers = await adapters.readPrismaPlayers();
  const playerMirrors = prismaPlayers.map((player) => mapPrismaPlayerToFirebaseMirror(player));
  const firestorePlayers = await adapters.readFirestorePlayers(options.clubId);
  const audit = auditFirebasePlayerMirror(playerMirrors, firestorePlayers);
  const mirrorsToWrite = writablePlayerMirrors(playerMirrors, audit);

  if (options.write) {
    if (!adapters.writePlayerMirrors) {
      throw new Error("Write mode requested, but no Firestore writer was provided.");
    }

    await adapters.writePlayerMirrors(options.clubId, mirrorsToWrite);
  }

  return {
    audit,
    dryRun: !options.write,
    projectId: options.projectId,
    clubId: options.clubId,
    players: {
      created: summarizeById(playerMirrors, audit.createdPlayerIds),
      updated: summarizeById(playerMirrors, audit.updatedPlayerIds),
      unchanged: summarizeById(playerMirrors, audit.unchangedPlayerIds),
      extra: summarizeById(playerMirrors, audit.extraPlayerIds)
    },
    writesPlanned: options.write ? mirrorsToWrite.length : 0,
    writesApplied: options.write ? mirrorsToWrite.length : 0
  };
}

function formatPlayerList(players: PlayerMirrorSeedPlayerSummary[]) {
  if (!players.length) {
    return "  - none";
  }

  return players.map((player) => `  - ${player.name} (${player.id})`).join("\n");
}

export function formatPlayerMirrorSeedReport(result: PlayerMirrorSeedResult) {
  return [
    `Firebase project: ${result.projectId}`,
    `Club ID: ${result.clubId}`,
    `Mode: ${result.dryRun ? "dry-run" : "write"}`,
    `Created: ${result.audit.counts.created}`,
    formatPlayerList(result.players.created),
    `Updated: ${result.audit.counts.updated}`,
    formatPlayerList(result.players.updated),
    `Unchanged: ${result.audit.counts.unchanged}`,
    formatPlayerList(result.players.unchanged),
    `Extra in Firestore: ${result.audit.counts.extra}`,
    formatPlayerList(result.players.extra),
    `Writes planned: ${result.writesPlanned}`,
    `Writes applied: ${result.writesApplied}`
  ].join("\n");
}
