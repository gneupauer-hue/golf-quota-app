export const FIREBASE_ACTIVE_ROUND_AUTO_PREP_FLAG =
  "FIREBASE_ACTIVE_ROUND_AUTO_PREP_ENABLED";

export function isActiveRoundAutoPreparationEnabled(
  env: Record<string, string | undefined> = process.env
) {
  return env[FIREBASE_ACTIVE_ROUND_AUTO_PREP_FLAG] === "true";
}
