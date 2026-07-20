export const FIREBASE_REALTIME_SCORE_DISPLAY_FLAG = "FIREBASE_REALTIME_SCORE_DISPLAY_ENABLED";

export function isRealtimeScoreDisplayEnabled(env: Record<string, string | undefined>) {
  return env[FIREBASE_REALTIME_SCORE_DISPLAY_FLAG] === "true";
}
