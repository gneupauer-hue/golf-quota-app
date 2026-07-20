import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { IREM_FIREBASE_PROJECT_ID } from "@/lib/firebase/player-mirror-seed";
import {
  buildScoreMirrorChecksumInput,
  mapPrismaScoresToFirebaseMirror,
  type PrismaScoreMirrorRoundInput
} from "@/lib/firebase/score-mirror";
import type {
  ClubRole,
  FirebaseScoreGoodSkinEntry,
  FirebaseScoreMirror,
  FirebaseScoreMirrorSource,
  MembershipStatus
} from "@/lib/firebase/types";

export type ScoreWriteOperation =
  | { type: "set-hole"; holeNumber: number; value: number | null }
  | { type: "set-quick-front"; value: number | null }
  | { type: "set-quick-back"; value: number | null }
  | { type: "set-birdie-holes"; value: FirebaseScoreGoodSkinEntry[] }
  | { type: "submit-front" }
  | { type: "submit-back" };

export type ScoreWriteRequestBody = {
  clubId?: unknown;
  expectedProjectId?: unknown;
  expectedPrismaRoundId?: unknown;
  prismaPlayerId?: unknown;
  operation?: unknown;
  expectedScoreVersion?: unknown;
  clientRequestId?: unknown;
};

export type ScoreWriteMembership = {
  role?: ClubRole | string;
  status?: MembershipStatus | string;
};

export type ScoreWriteAuth = {
  uid: string;
};

export type ScoreWritePrismaRound = PrismaScoreMirrorRoundInput & {
  isTestRound: boolean;
  completedAt?: Date | string | null;
  canceledAt?: Date | string | null;
  isPayoutLocked?: boolean | null;
};

export type FirestoreScoreWriteDocument = FirebaseScoreMirror & {
  syncedAt?: unknown;
  lastOperationId?: string;
  lastEditedByUid?: string;
  lastEditedAt?: unknown;
  lastClientRequestId?: string | null;
};

export type ScoreWriteTransactionInput = {
  clubId: string;
  roundId: string;
  prismaPlayerId: string;
  operationId: string;
  clientRequestId: string | null;
  expectedScoreVersion: number | null;
  uid: string;
  initialScore: FirebaseScoreMirror;
  operation: ScoreWriteOperation;
};

export type ScoreWriteTransactionResult = {
  previousScoreVersion: number;
  scoreVersion: number;
  alreadyApplied: boolean;
  updatedFields: string[];
};

export type ScoreWriteRouteAdapters = {
  verifyIdToken: (idToken: string) => Promise<ScoreWriteAuth>;
  verifyClub: (clubId: string) => Promise<{ id: string } | null>;
  readClubMembership: (clubId: string, uid: string) => Promise<ScoreWriteMembership | null>;
  readActivePrismaRoundScores: () => Promise<ScoreWritePrismaRound | null>;
  readFirestoreRoundShell: (clubId: string, roundId: string) => Promise<Record<string, unknown> | null>;
  runScoreWriteTransaction: (input: ScoreWriteTransactionInput) => Promise<ScoreWriteTransactionResult>;
  isRegularRoundScoreMirrorEnabled?: () => boolean;
  createOperationId?: () => string;
};

const VALID_HOLE_SCORES = new Set([-1, 0, 1, 2, 4, 6]);
const VALID_SKIN_TYPES = new Set(["birdie", "eagle", "ace"]);
export const FIREBASE_REGULAR_ROUND_SCORE_MIRROR_FLAG = "FIREBASE_REGULAR_ROUND_SCORE_MIRROR_ENABLED";

export function isRegularRoundScoreMirrorServerEnabled(env: Record<string, string | undefined> = process.env) {
  return env[FIREBASE_REGULAR_ROUND_SCORE_MIRROR_FLAG] === "true";
}

function jsonError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    throw Object.assign(new Error("Sign in before writing test-round scores."), { status: 401 });
  }

  return match[1];
}

async function parseRequestBody(request: Request): Promise<ScoreWriteRequestBody> {
  try {
    const body = (await request.json()) as unknown;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Request body must be a JSON object.");
    }

    return body as ScoreWriteRequestBody;
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 });
  }
}

function assertActiveMembership(membership: ScoreWriteMembership | null) {
  if (!membership) {
    throw Object.assign(new Error("You are not a member of this club."), { status: 403 });
  }
  if (membership.status !== "active") {
    throw Object.assign(new Error("Your club membership is not active."), { status: 403 });
  }
  if (
    membership.role !== "owner" &&
    membership.role !== "admin" &&
    membership.role !== "scorekeeper" &&
    membership.role !== "member"
  ) {
    throw Object.assign(new Error("Your club role cannot write test-round scores."), { status: 403 });
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateQuickScore(value: unknown, label: string) {
  if (value !== null && (typeof value !== "number" || !Number.isInteger(value) || value < -9 || value > 54)) {
    throw Object.assign(new Error(`${label} must be a whole-number point total.`), { status: 400 });
  }
  return value;
}

function validateHoleScore(value: unknown) {
  if (value !== null && (typeof value !== "number" || !VALID_HOLE_SCORES.has(value))) {
    throw Object.assign(new Error("Hole score must be one of -1, 0, 1, 2, 4, 6, or null."), {
      status: 400
    });
  }
  return value;
}

function normalizeBirdieHoles(value: unknown): FirebaseScoreGoodSkinEntry[] {
  if (!Array.isArray(value)) {
    throw Object.assign(new Error("Birdie holes must be an array."), { status: 400 });
  }

  const byHole = new Map<number, FirebaseScoreGoodSkinEntry>();
  for (const entry of value) {
    if (!isObject(entry)) {
      throw Object.assign(new Error("Birdie hole entries must be objects."), { status: 400 });
    }
    const holeNumber = entry.holeNumber;
    const type = entry.type;
    const score = entry.score;
    if (typeof holeNumber !== "number" || !Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) {
      throw Object.assign(new Error("Birdie hole numbers must be 1 through 18."), { status: 400 });
    }
    if (typeof type !== "string" || !VALID_SKIN_TYPES.has(type)) {
      throw Object.assign(new Error("Birdie hole type must be birdie, eagle, or ace."), { status: 400 });
    }
    const expectedScore = type === "ace" ? 8 : type === "eagle" ? 6 : 4;
    if (typeof score !== "number" || score !== expectedScore) {
      throw Object.assign(new Error("Birdie hole score must match its type."), { status: 400 });
    }
    byHole.set(holeNumber, { holeNumber, type: type as FirebaseScoreGoodSkinEntry["type"], score });
  }

  return [...byHole.values()].sort((left, right) => left.holeNumber - right.holeNumber);
}

function validateOperation(value: unknown): ScoreWriteOperation {
  if (!isObject(value) || typeof value.type !== "string") {
    throw Object.assign(new Error("operation is required."), { status: 400 });
  }

  const protectedFields = [
    "prismaEntryId",
    "checksum",
    "scoreVersion",
    "source",
    "points",
    "rank",
    "plusMinus",
    "payout"
  ];
  if (protectedFields.some((field) => field in value)) {
    throw Object.assign(new Error("operation cannot include protected score fields."), { status: 400 });
  }

  if (value.type === "set-hole") {
    if (!Number.isInteger(value.holeNumber) || typeof value.holeNumber !== "number" || value.holeNumber < 1 || value.holeNumber > 18) {
      throw Object.assign(new Error("set-hole requires one hole number from 1 to 18."), { status: 400 });
    }
    return {
      type: "set-hole",
      holeNumber: value.holeNumber,
      value: validateHoleScore(value.value) as number | null
    };
  }

  if (value.type === "set-quick-front") {
    return { type: "set-quick-front", value: validateQuickScore(value.value, "Front quick score") as number | null };
  }

  if (value.type === "set-quick-back") {
    return { type: "set-quick-back", value: validateQuickScore(value.value, "Back quick score") as number | null };
  }

  if (value.type === "set-birdie-holes") {
    return { type: "set-birdie-holes", value: normalizeBirdieHoles(value.value) };
  }

  if (value.type === "submit-front" || value.type === "submit-back") {
    if (Object.keys(value).some((key) => key !== "type")) {
      throw Object.assign(new Error(`${value.type} does not accept extra fields.`), { status: 400 });
    }
    return { type: value.type };
  }

  throw Object.assign(new Error("Unsupported score operation type."), { status: 400 });
}

function validateRequestBody(body: ScoreWriteRequestBody) {
  if (typeof body.clubId !== "string" || !body.clubId.trim()) {
    throw Object.assign(new Error("clubId is required."), { status: 400 });
  }
  if (body.expectedProjectId !== IREM_FIREBASE_PROJECT_ID) {
    throw Object.assign(new Error(`expectedProjectId must be "${IREM_FIREBASE_PROJECT_ID}".`), {
      status: 400
    });
  }
  if (typeof body.expectedPrismaRoundId !== "string" || !body.expectedPrismaRoundId.trim()) {
    throw Object.assign(new Error("expectedPrismaRoundId is required."), { status: 400 });
  }
  if (typeof body.prismaPlayerId !== "string" || !body.prismaPlayerId.trim()) {
    throw Object.assign(new Error("prismaPlayerId is required."), { status: 400 });
  }
  if (
    body.expectedScoreVersion !== undefined &&
    (!Number.isInteger(body.expectedScoreVersion) || typeof body.expectedScoreVersion !== "number" || body.expectedScoreVersion < 0)
  ) {
    throw Object.assign(new Error("expectedScoreVersion must be a non-negative integer."), {
      status: 400
    });
  }
  if (body.clientRequestId !== undefined && (typeof body.clientRequestId !== "string" || !body.clientRequestId.trim())) {
    throw Object.assign(new Error("clientRequestId must be a non-empty string when supplied."), {
      status: 400
    });
  }

  return {
    clubId: body.clubId,
    expectedPrismaRoundId: body.expectedPrismaRoundId,
    prismaPlayerId: body.prismaPlayerId,
    expectedScoreVersion: body.expectedScoreVersion == null ? null : body.expectedScoreVersion,
    clientRequestId: typeof body.clientRequestId === "string" ? body.clientRequestId : null,
    operation: validateOperation(body.operation)
  };
}

function assertScoreWriteRoundGate(
  round: ScoreWritePrismaRound | null,
  expectedPrismaRoundId: string,
  options: {
    regularRoundEnabled: boolean;
    firestoreRoundShell: Record<string, unknown> | null;
  }
): asserts round is ScoreWritePrismaRound {
  if (!round) {
    throw Object.assign(new Error("No active Prisma round exists."), { status: 409 });
  }
  if (round.id !== expectedPrismaRoundId) {
    throw Object.assign(new Error(`expectedPrismaRoundId must match active Prisma round "${round.id}".`), {
      status: 409
    });
  }
  if (round.canceledAt || round.completedAt || round.isPayoutLocked) {
    throw Object.assign(new Error("Closed, canceled, posted, or payout-locked rounds cannot use test score writes."), {
      status: 409
    });
  }

  if (round.isTestRound === true) {
    return;
  }

  if (!options.regularRoundEnabled) {
    throw Object.assign(new Error("Regular-round Firestore score mirroring is disabled."), {
      status: 403
    });
  }

  const shell = options.firestoreRoundShell;
  if (!shell) {
    throw Object.assign(new Error("Regular-round score mirroring requires an existing Firestore round shell."), {
      status: 409
    });
  }
  if (
    shell.prismaRoundId !== round.id ||
    shell.roundMode !== round.roundMode ||
    shell.scoringEntryMode !== round.scoringEntryMode ||
    shell.isTestRound !== false
  ) {
    throw Object.assign(new Error("Firestore round shell does not match the active Prisma round."), {
      status: 409
    });
  }
}

function findPlayerScore(round: PrismaScoreMirrorRoundInput, prismaPlayerId: string) {
  const entries = round.entries.filter((entry) => entry.playerId === prismaPlayerId);
  if (entries.length === 0) {
    throw Object.assign(new Error("Player is not in the active round."), { status: 404 });
  }
  if (entries.length > 1) {
    throw Object.assign(new Error("Duplicate player entries found in the active round."), { status: 409 });
  }
  const mapped = mapPrismaScoresToFirebaseMirror(round).scores.find(
    (score) => score.prismaPlayerId === prismaPlayerId
  );
  if (!mapped) {
    throw Object.assign(new Error("Could not build the player's canonical score mirror."), {
      status: 500
    });
  }
  return mapped;
}

function stableGoodSkinEntries(value: FirebaseScoreGoodSkinEntry[]) {
  return stableStringify([...value].sort((left, right) => left.holeNumber - right.holeNumber || left.type.localeCompare(right.type)));
}

export function assertOperationMatchesLatestPrismaScore(
  operation: ScoreWriteOperation,
  latestScore: FirebaseScoreMirror
) {
  if (operation.type === "set-hole") {
    const latestValue = latestScore.holes[String(operation.holeNumber) as keyof typeof latestScore.holes];
    if (latestValue !== operation.value) {
      throw Object.assign(new Error("Latest Prisma score does not match the requested Firestore hole value."), {
        status: 409
      });
    }
    return;
  }

  if (operation.type === "set-quick-front") {
    if (latestScore.quickFrontNine !== operation.value) {
      throw Object.assign(new Error("Latest Prisma score does not match the requested Firestore Front value."), {
        status: 409
      });
    }
    return;
  }

  if (operation.type === "set-quick-back") {
    if (latestScore.quickBackNine !== operation.value) {
      throw Object.assign(new Error("Latest Prisma score does not match the requested Firestore Back value."), {
        status: 409
      });
    }
    return;
  }

  if (operation.type === "set-birdie-holes") {
    if (stableGoodSkinEntries(latestScore.birdieHoles) !== stableGoodSkinEntries(operation.value)) {
      throw Object.assign(new Error("Latest Prisma score does not match the requested Firestore birdie-hole value."), {
        status: 409
      });
    }
  }
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

export function calculateScoreWriteChecksum(score: Omit<FirebaseScoreMirror, "checksum">) {
  return createHash("sha256").update(stableStringify(buildScoreMirrorChecksumInput(score))).digest("hex");
}

export function applyScoreWriteOperation(
  current: FirestoreScoreWriteDocument,
  operation: ScoreWriteOperation,
  nowIso: string
): { score: FirestoreScoreWriteDocument; updatedFields: string[] } {
  const next: FirestoreScoreWriteDocument = {
    ...current,
    holes: { ...current.holes },
    birdieHoles: [...current.birdieHoles],
    source: "firestore-test" as FirebaseScoreMirrorSource
  };
  const updatedFields: string[] = [];

  if (operation.type === "set-hole") {
    next.holes[String(operation.holeNumber) as keyof typeof next.holes] = operation.value;
    updatedFields.push(`holes.${operation.holeNumber}`);
  } else if (operation.type === "set-quick-front") {
    if (next.scoringEntryMode !== "QUICK") {
      throw Object.assign(new Error("Quick front score writes require QUICK scoring mode."), { status: 400 });
    }
    next.quickFrontNine = operation.value;
    updatedFields.push("quickFrontNine");
  } else if (operation.type === "set-quick-back") {
    if (next.scoringEntryMode !== "QUICK") {
      throw Object.assign(new Error("Quick back score writes require QUICK scoring mode."), { status: 400 });
    }
    next.quickBackNine = operation.value;
    updatedFields.push("quickBackNine");
  } else if (operation.type === "set-birdie-holes") {
    next.birdieHoles = operation.value;
    updatedFields.push("birdieHoles");
  } else if (operation.type === "submit-front") {
    next.frontSubmittedAt = nowIso;
    updatedFields.push("frontSubmittedAt");
  } else {
    next.backSubmittedAt = nowIso;
    updatedFields.push("backSubmittedAt");
  }

  const checksumInput: Omit<FirebaseScoreMirror, "checksum"> = {
    prismaRoundId: next.prismaRoundId,
    prismaEntryId: next.prismaEntryId,
    prismaPlayerId: next.prismaPlayerId,
    scoringEntryMode: next.scoringEntryMode,
    roundMode: next.roundMode,
    holes: next.holes,
    quickFrontNine: next.quickFrontNine,
    quickBackNine: next.quickBackNine,
    frontSubmittedAt: next.frontSubmittedAt,
    backSubmittedAt: next.backSubmittedAt,
    birdieHoles: next.birdieHoles,
    source: next.source,
    scoreVersion: next.scoreVersion
  };
  next.checksum = calculateScoreWriteChecksum(checksumInput);

  return { score: next, updatedFields };
}

export function buildInitialScoreWriteDocument(score: FirebaseScoreMirror): FirestoreScoreWriteDocument {
  return {
    ...score,
    source: "firestore-test",
    scoreVersion: 1,
    checksum: calculateScoreWriteChecksum({
      ...score,
      source: "firestore-test",
      scoreVersion: 1
    })
  };
}

export function normalizeExistingScoreDocument(
  docId: string,
  data: Record<string, unknown>,
  expected: FirestoreScoreWriteDocument
): FirestoreScoreWriteDocument {
  const protectedResultFields = [
    "frontNine",
    "backNine",
    "totalPoints",
    "plusMinus",
    "rank",
    "nextQuota",
    "payout",
    "skinsPayout",
    "postingState"
  ];
  const disallowed = protectedResultFields.find((field) => field in data);
  if (disallowed) {
    throw new Error(`Malformed Firestore score document contains derived field ${disallowed}.`);
  }

  if (docId !== expected.prismaPlayerId) {
    throw new Error("Firestore score document ID must match the Prisma player ID.");
  }
  if (data.prismaRoundId !== expected.prismaRoundId) {
    throw new Error("Firestore score document round ID does not match the active Prisma round.");
  }
  if (data.prismaEntryId !== expected.prismaEntryId) {
    throw new Error("Firestore score document entry ID does not match the active Prisma round entry.");
  }
  if (data.prismaPlayerId !== expected.prismaPlayerId) {
    throw new Error("Firestore score document player ID does not match the request.");
  }
  if (typeof data.scoreVersion !== "number" || !Number.isInteger(data.scoreVersion) || data.scoreVersion < 1) {
    throw new Error("Firestore score document has an invalid scoreVersion.");
  }
  if (data.source !== "prisma" && data.source !== "firestore-test") {
    throw new Error("Firestore score document has an invalid source.");
  }
  if (typeof data.checksum !== "string" || !/^[a-f0-9]{64}$/.test(data.checksum)) {
    throw new Error("Firestore score document has an invalid checksum.");
  }
  if (!isObject(data.holes) || !Array.isArray(data.birdieHoles)) {
    throw new Error("Firestore score document is malformed.");
  }

  return {
    ...expected,
    ...data,
    holes: data.holes as FirestoreScoreWriteDocument["holes"],
    birdieHoles: data.birdieHoles as FirestoreScoreWriteDocument["birdieHoles"],
    scoreVersion: data.scoreVersion,
    source: data.source,
    checksum: data.checksum,
    lastClientRequestId:
      typeof data.lastClientRequestId === "string" ? data.lastClientRequestId : null
  };
}

export async function handleScoreWriteRequest(
  request: Request,
  adapters: ScoreWriteRouteAdapters
) {
  const operationId = adapters.createOperationId?.() ?? `scoreWrite-${randomUUID()}`;

  try {
    const body = await parseRequestBody(request);
    const input = validateRequestBody(body);
    const decoded = await adapters.verifyIdToken(getBearerToken(request));
    const club = await adapters.verifyClub(input.clubId);

    if (!club) {
      return jsonError(`Club "${input.clubId}" was not found or is not accessible.`, 404, { operationId });
    }

    assertActiveMembership(await adapters.readClubMembership(input.clubId, decoded.uid));

    const activeRound = await adapters.readActivePrismaRoundScores();
    const firestoreRoundShell = activeRound?.isTestRound === false
      ? await adapters.readFirestoreRoundShell(input.clubId, input.expectedPrismaRoundId)
      : null;
    assertScoreWriteRoundGate(activeRound, input.expectedPrismaRoundId, {
      regularRoundEnabled: adapters.isRegularRoundScoreMirrorEnabled?.() ?? isRegularRoundScoreMirrorServerEnabled(),
      firestoreRoundShell
    });

    const latestPrismaScore = findPlayerScore(activeRound, input.prismaPlayerId);
    if (activeRound.isTestRound === false) {
      assertOperationMatchesLatestPrismaScore(input.operation, latestPrismaScore);
    }
    const initialScore = buildInitialScoreWriteDocument(latestPrismaScore);
    const result = await adapters.runScoreWriteTransaction({
      clubId: input.clubId,
      roundId: activeRound.id,
      prismaPlayerId: input.prismaPlayerId,
      operationId,
      clientRequestId: input.clientRequestId,
      expectedScoreVersion: input.expectedScoreVersion,
      uid: decoded.uid,
      initialScore,
      operation: input.operation
    });

    return NextResponse.json({
      ok: true,
      status: result.alreadyApplied ? "already-applied" : "written",
      roundId: activeRound.id,
      prismaPlayerId: input.prismaPlayerId,
      operationType: input.operation.type,
      operationId,
      ...(input.clientRequestId ? { clientRequestId: input.clientRequestId } : {}),
      alreadyApplied: result.alreadyApplied,
      previousScoreVersion: result.previousScoreVersion,
      scoreVersion: result.scoreVersion,
      updatedFields: result.updatedFields,
      serverTimestamp: true
    });
  } catch (error) {
    const status =
      error &&
      typeof error === "object" &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : 500;
    const extra =
      error &&
      typeof error === "object" &&
      "currentScoreVersion" in error &&
      typeof error.currentScoreVersion === "number"
        ? { currentScoreVersion: error.currentScoreVersion }
        : {};

    return jsonError(
      error instanceof Error ? error.message : "Could not write test-round score.",
      status,
      { operationId, ...extra }
    );
  }
}
