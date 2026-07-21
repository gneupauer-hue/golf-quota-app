export type ClubRole = "owner" | "admin" | "scorekeeper" | "member";
export type ClubStatus = "active" | "archived";
// "requested" = a phone signup awaiting owner approval; cannot score until "active".
export type MembershipStatus = "active" | "invited" | "requested" | "removed";

export type FirebaseUserProfile = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  defaultClubId: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type FirebaseClub = {
  name: string;
  slug: string;
  app: "irem";
  status: ClubStatus;
  migrationPhase: 1;
  createdByUid: string;
  ownerUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type FirebaseClubMembership = {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: ClubRole;
  status: MembershipStatus;
  // Multi-user phone signup + approval fields.
  phoneNumber?: string | null;
  gameTextConsent?: boolean;
  linkedPlayerId?: string | null;
  requestedAt?: unknown;
  approvedAt?: unknown;
  approvedByUid?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
};

// Top-level mirror for listing a user's clubs without exposing all club member docs.
export type FirebaseUserClubMembership = FirebaseClubMembership & {
  clubId: string;
  clubName: string;
};

export type FirebasePlayerMirrorSource = "prisma";

export type FirebasePlayerMirror = {
  prismaPlayerId: string;
  name: string;
  normalizedName: string;
  isActive: boolean;
  isRegular: boolean;
  currentQuota: number;
  startingQuota: number;
  storedQuota: number | null;
  finalizedNonTestRoundCount: number;
  conflictPlayerIds: string[];
  source: FirebasePlayerMirrorSource;
  prismaUpdatedAt: string;
  syncVersion: number;
  checksum: string;
};

export function getRoundPath(clubId: string, roundId: string) {
  return `clubs/${clubId}/rounds/${roundId}`;
}

export function getActiveRoundPointerPath(clubId: string) {
  return `clubs/${clubId}/state/activeRound`;
}

export type FirebaseRoundMirrorSource = "prisma";
export type FirebaseRoundMirrorStatus = "setup" | "active" | "locked" | "canceled" | "posted";
export type FirebaseRoundMirrorMode = "MATCH_QUOTA" | "SKINS_ONLY";
export type FirebaseRoundScoringEntryMode = "QUICK" | "DETAILED";
export type FirebaseRoundTeamCode = "A" | "B" | "C" | "D" | "E";

export type FirebaseRoundMirror = {
  prismaRoundId: string;
  roundName: string;
  roundDate: string;
  roundMode: FirebaseRoundMirrorMode;
  scoringEntryMode: FirebaseRoundScoringEntryMode;
  isTestRound: boolean;
  status: FirebaseRoundMirrorStatus;
  teamCount: number | null;
  notes: string | null;
  setupVersion: number;
  source: FirebaseRoundMirrorSource;
  migrationPhase: 3;
  prismaCreatedAt: string;
  prismaUpdatedAt: string;
  createdByUid: null;
  updatedByUid: null;
  checksum: string;
};

export type FirebaseRoundEntryMirror = {
  prismaEntryId: string;
  prismaPlayerId: string;
  playerName: string;
  normalizedName: string;
  startQuota: number;
  currentQuota: number;
  team: FirebaseRoundTeamCode | null;
  groupNumber: number | null;
  teeTime: string | null;
  sortOrder: number;
  isActive: boolean;
  isRegular: boolean;
  setupVersion: number;
  checksum: string;
};

export type FirebaseActiveRoundPointerMirror = {
  roundId: string;
  prismaRoundId: string;
  status: FirebaseRoundMirrorStatus;
  checksum: string;
};

export type FirebaseScoreMirrorSource = "prisma" | "firestore-test";
export type FirebaseScoreHoleNumber =
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "11"
  | "12"
  | "13"
  | "14"
  | "15"
  | "16"
  | "17"
  | "18";
export type FirebaseScoreHoles = Record<FirebaseScoreHoleNumber, number | null>;
export type FirebaseScoreGoodSkinType = "birdie" | "eagle" | "ace";

export type FirebaseScoreGoodSkinEntry = {
  holeNumber: number;
  type: FirebaseScoreGoodSkinType;
  score: number;
};

export type FirebaseScoreMirror = {
  prismaRoundId: string;
  prismaEntryId: string;
  prismaPlayerId: string;
  scoringEntryMode: FirebaseRoundScoringEntryMode;
  roundMode: FirebaseRoundMirrorMode;
  holes: FirebaseScoreHoles;
  quickFrontNine: number | null;
  quickBackNine: number | null;
  frontSubmittedAt: string | null;
  backSubmittedAt: string | null;
  birdieHoles: FirebaseScoreGoodSkinEntry[];
  source: FirebaseScoreMirrorSource;
  scoreVersion: number;
  checksum: string;
};
