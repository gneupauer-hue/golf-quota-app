export type ClubRole = "owner" | "admin" | "scorekeeper" | "member";
export type ClubStatus = "active" | "archived";
export type MembershipStatus = "active" | "invited" | "removed";

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
