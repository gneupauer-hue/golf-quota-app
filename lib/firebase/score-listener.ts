"use client";

import { collection, onSnapshot, type Firestore } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type {
  FirebaseRoundMirrorMode,
  FirebaseRoundScoringEntryMode,
  FirebaseScoreGoodSkinEntry,
  FirebaseScoreHoleNumber,
  FirebaseScoreHoles,
  FirebaseScoreMirror
} from "@/lib/firebase/types";
import type { RealtimeScoreDisplayMirror } from "@/lib/firebase/realtime-score-display";

export type ScoreMirrorListenerDocument = {
  id: string;
  data: () => unknown;
};

export type NormalizedScoreMirrorDocument = {
  docId: string;
  score: RealtimeScoreDisplayMirror | null;
  malformedReason: string | null;
};

export type ScoreMirrorListenerSnapshot = {
  scores: RealtimeScoreDisplayMirror[];
  malformed: NormalizedScoreMirrorDocument[];
};

type SubscribeToScoreMirrorCollectionOptions = {
  clubId: string;
  roundId: string;
  db?: Firestore;
  makeCollection?: (db: Firestore, ...pathSegments: string[]) => unknown;
  onSnapshotFn?: (
    collectionRef: unknown,
    onNext: (snapshot: { docs: ScoreMirrorListenerDocument[] }) => void,
    onError: (error: unknown) => void
  ) => () => void;
  onNext: (snapshot: ScoreMirrorListenerSnapshot) => void;
  onError: (error: Error) => void;
};

const SCORE_HOLE_KEYS = Array.from({ length: 18 }, (_, index) => String(index + 1)) as FirebaseScoreHoleNumber[];
const VALID_HOLE_VALUES = new Set([-1, 0, 1, 2, 4, 6, 8]);
const VALID_ROUND_MODES = new Set<FirebaseRoundMirrorMode>(["MATCH_QUOTA", "SKINS_ONLY"]);
const VALID_SCORING_ENTRY_MODES = new Set<FirebaseRoundScoringEntryMode>(["QUICK", "DETAILED"]);
const VALID_SKIN_TYPES = new Set(["birdie", "eagle", "ace"]);

export function getScoreMirrorCollectionPath(clubId: string, roundId: string) {
  return `clubs/${clubId}/rounds/${roundId}/scores`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNullableNumber(value: unknown) {
  return value === null || typeof value === "number";
}

function isNullableIsoString(value: unknown) {
  if (value === null) {
    return true;
  }
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function normalizeHoles(value: unknown): FirebaseScoreHoles | string {
  if (!isPlainObject(value)) {
    return "holes must be an object.";
  }

  const holes = {} as FirebaseScoreHoles;
  for (const key of SCORE_HOLE_KEYS) {
    const holeValue = value[key];
    if (holeValue !== null && (typeof holeValue !== "number" || !VALID_HOLE_VALUES.has(holeValue))) {
      return `hole ${key} is malformed.`;
    }
    holes[key] = holeValue;
  }

  return holes;
}

function normalizeBirdieHoles(value: unknown): FirebaseScoreGoodSkinEntry[] | string {
  if (!Array.isArray(value)) {
    return "birdieHoles must be an array.";
  }

  const entries: FirebaseScoreGoodSkinEntry[] = [];
  for (const entry of value) {
    if (!isPlainObject(entry)) {
      return "birdieHoles contains a malformed entry.";
    }
    const holeNumber = entry.holeNumber;
    const type = entry.type;
    const score = entry.score;
    if (!Number.isInteger(holeNumber) || typeof holeNumber !== "number" || holeNumber < 1 || holeNumber > 18) {
      return "birdieHoles contains an invalid hole number.";
    }
    if (typeof type !== "string" || !VALID_SKIN_TYPES.has(type)) {
      return "birdieHoles contains an invalid type.";
    }
    if (typeof score !== "number" || !VALID_HOLE_VALUES.has(score)) {
      return "birdieHoles contains an invalid score.";
    }
    entries.push({
      holeNumber,
      type: type as FirebaseScoreGoodSkinEntry["type"],
      score
    });
  }

  return entries;
}

export function normalizeScoreMirrorDocument(doc: ScoreMirrorListenerDocument): NormalizedScoreMirrorDocument {
  const data = doc.data();
  if (!isPlainObject(data)) {
    return { docId: doc.id, score: null, malformedReason: "Document data must be an object." };
  }

  const stringFields = ["prismaRoundId", "prismaEntryId", "prismaPlayerId", "source", "checksum"] as const;
  for (const field of stringFields) {
    if (typeof data[field] !== "string" || !data[field].trim()) {
      return { docId: doc.id, score: null, malformedReason: `${field} must be a non-empty string.` };
    }
  }

  if (doc.id !== data.prismaPlayerId) {
    return {
      docId: doc.id,
      score: null,
      malformedReason: "Document ID must match prismaPlayerId."
    };
  }

  if (!VALID_SCORING_ENTRY_MODES.has(data.scoringEntryMode as FirebaseRoundScoringEntryMode)) {
    return { docId: doc.id, score: null, malformedReason: "scoringEntryMode is invalid." };
  }

  if (!VALID_ROUND_MODES.has(data.roundMode as FirebaseRoundMirrorMode)) {
    return { docId: doc.id, score: null, malformedReason: "roundMode is invalid." };
  }

  if (data.source !== "prisma" && data.source !== "firestore-test") {
    return { docId: doc.id, score: null, malformedReason: "source must be prisma or firestore-test." };
  }

  if (!Number.isInteger(data.scoreVersion) || typeof data.scoreVersion !== "number" || data.scoreVersion < 1) {
    return { docId: doc.id, score: null, malformedReason: "scoreVersion must be a positive integer." };
  }

  const holes = normalizeHoles(data.holes);
  if (typeof holes === "string") {
    return { docId: doc.id, score: null, malformedReason: holes };
  }

  if (!isNullableNumber(data.quickFrontNine) || !isNullableNumber(data.quickBackNine)) {
    return { docId: doc.id, score: null, malformedReason: "Quick score values must be numbers or null." };
  }

  if (!isNullableIsoString(data.frontSubmittedAt) || !isNullableIsoString(data.backSubmittedAt)) {
    return { docId: doc.id, score: null, malformedReason: "Submission timestamps must be ISO strings or null." };
  }

  const birdieHoles = normalizeBirdieHoles(data.birdieHoles);
  if (typeof birdieHoles === "string") {
    return { docId: doc.id, score: null, malformedReason: birdieHoles };
  }

  const prismaRoundId = data.prismaRoundId as string;
  const prismaEntryId = data.prismaEntryId as string;
  const prismaPlayerId = data.prismaPlayerId as string;
  const quickFrontNine = data.quickFrontNine as number | null;
  const quickBackNine = data.quickBackNine as number | null;
  const frontSubmittedAt = data.frontSubmittedAt as string | null;
  const backSubmittedAt = data.backSubmittedAt as string | null;
  const checksum = data.checksum as string;
  const scoreVersion = data.scoreVersion;
  const source = data.source as FirebaseScoreMirror["source"];
  const lastEditedByUid = typeof data.lastEditedByUid === "string" ? data.lastEditedByUid : null;
  const lastOperationId = typeof data.lastOperationId === "string" ? data.lastOperationId : null;

  return {
    docId: doc.id,
    malformedReason: null,
    score: {
      prismaRoundId,
      prismaEntryId,
      prismaPlayerId,
      scoringEntryMode: data.scoringEntryMode as FirebaseRoundScoringEntryMode,
      roundMode: data.roundMode as FirebaseRoundMirrorMode,
      holes,
      quickFrontNine,
      quickBackNine,
      frontSubmittedAt,
      backSubmittedAt,
      birdieHoles,
      source,
      scoreVersion,
      checksum,
      lastEditedByUid,
      lastOperationId
    }
  };
}

export function normalizeScoreMirrorSnapshot(docs: ScoreMirrorListenerDocument[]): ScoreMirrorListenerSnapshot {
  const normalized = docs.map((doc) => normalizeScoreMirrorDocument(doc));
  return {
    scores: normalized.flatMap((doc) => (doc.score ? [doc.score] : [])),
    malformed: normalized.filter((doc) => doc.malformedReason)
  };
}

export function subscribeToScoreMirrorCollection({
  clubId,
  roundId,
  db = getFirebaseDb(),
  makeCollection = collection,
  onSnapshotFn = onSnapshot as unknown as SubscribeToScoreMirrorCollectionOptions["onSnapshotFn"],
  onNext,
  onError
}: SubscribeToScoreMirrorCollectionOptions) {
  const scoreCollection = makeCollection(db, "clubs", clubId, "rounds", roundId, "scores");
  const subscribe = onSnapshotFn ?? (onSnapshot as unknown as NonNullable<SubscribeToScoreMirrorCollectionOptions["onSnapshotFn"]>);

  return subscribe(
    scoreCollection,
    (snapshot) => {
      onNext(normalizeScoreMirrorSnapshot(snapshot.docs));
    },
    (error) => {
      onError(error instanceof Error ? error : new Error("Could not read Firestore score mirrors."));
    }
  );
}
