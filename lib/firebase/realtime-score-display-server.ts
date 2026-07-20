import "server-only";

import {
  FIREBASE_REALTIME_SCORE_DISPLAY_FLAG,
  isRealtimeScoreDisplayEnabled
} from "@/lib/firebase/realtime-score-display-rollout";

export function getRealtimeScoreDisplayCapability() {
  const privateFlagPresent =
    typeof process.env[FIREBASE_REALTIME_SCORE_DISPLAY_FLAG] === "string";
  const capabilityEnabled = isRealtimeScoreDisplayEnabled(process.env);

  console.info("[realtime-score-display] capability evaluated", {
    privateFlagPresent,
    capabilityEnabled
  });

  return capabilityEnabled;
}
