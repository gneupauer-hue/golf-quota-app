// When "true", the scoring endpoints require a signed-in, owner-approved member.
// Kept off by default so the lockdown can be deployed first and switched on only
// once members are approved (and rolled back instantly by flipping it off).
export const FIREBASE_REQUIRE_APPROVED_SCORER_FLAG = "FIREBASE_REQUIRE_APPROVED_SCORER_ENABLED";

export function isApprovedScorerRequired(
  env: Record<string, string | undefined> = process.env
) {
  return env[FIREBASE_REQUIRE_APPROVED_SCORER_FLAG] === "true";
}
