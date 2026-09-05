/**
 * Phase E.2 — cookie that parks the operator's fresh "return" session while
 * they are inside a support-impersonation window. httpOnly, so the banner
 * detection in the app shell and the stop route both resolve it server-side;
 * client JS never sees the token.
 */
export const OPERATOR_RETURN_COOKIE = "wamiro_support_return";
