export const MAX_DISPLAY_NAME_LENGTH = 20;
export const ADMIN_TOKEN_KEY_PREFIX = "pp_admin_";
export const SESSION_ID_KEY = "pp_session_id";
export const DISPLAY_NAME_KEY = "pp_display_name";

export function getAdminTokenKey(roomId: string): string {
  return `${ADMIN_TOKEN_KEY_PREFIX}${roomId}`;
}
