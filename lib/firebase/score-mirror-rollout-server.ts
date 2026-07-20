import "server-only";

import { isRegularRoundScoreMirrorCapabilityEnabled } from "@/lib/firebase/score-mirror-rollout";

export function getRegularRoundScoreMirrorCapability() {
  return isRegularRoundScoreMirrorCapabilityEnabled(process.env);
}
