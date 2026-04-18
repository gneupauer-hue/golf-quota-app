export const PLAYER_EDIT_PASSWORD = "Gary";
export const PLAYER_EDIT_COOKIE = "player_edit_unlocked";

export function hasValidPlayerEditSession(cookieValue: string | undefined) {
  return cookieValue === "1";
}
