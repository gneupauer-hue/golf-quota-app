export const ROUND_SCORE_EDIT_PASSWORD = "Gary";
export const ROUND_SCORE_EDIT_COOKIE = "round_score_edit_unlocked";

export function hasValidRoundScoreEditSession(cookieValue: string | undefined) {
  return cookieValue === "1";
}
