export const FIREBASE_REGULAR_ROUND_SCORE_MIRROR_FLAG =
  "FIREBASE_REGULAR_ROUND_SCORE_MIRROR_ENABLED";

export function isRegularRoundScoreMirrorCapabilityEnabled(
  env: Record<string, string | undefined>
) {
  return env[FIREBASE_REGULAR_ROUND_SCORE_MIRROR_FLAG] === "true";
}
