import "server-only";

import {
  FIREBASE_REGULAR_ROUND_SCORE_MIRROR_FLAG,
  isRegularRoundScoreMirrorCapabilityEnabled
} from "@/lib/firebase/score-mirror-rollout";

export function getRegularRoundScoreMirrorCapability() {
  const privateFlagPresent =
    typeof process.env[FIREBASE_REGULAR_ROUND_SCORE_MIRROR_FLAG] === "string";
  const capabilityEnabled = isRegularRoundScoreMirrorCapabilityEnabled(process.env);

  console.info("[score-mirror-rollout] capability evaluated", {
    privateFlagPresent,
    capabilityEnabled
  });

  return capabilityEnabled;
}
