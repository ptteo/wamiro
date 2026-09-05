/** Client-safe path helpers. Keep this file free of db/session imports. */

export function onboardingComplete(state: string | null | undefined): boolean {
  return !state || state === "complete";
}

export const GATED_API_PREFIXES = [
  "/api/v1/tickets",
  "/api/v1/leave",
  "/api/v1/attendance",
  "/api/v1/payroll",
  "/api/v1/requests",
  "/api/v1/projects",
  "/api/v1/tasks",
  "/api/v1/shifts",
  "/api/v1/goals",
  "/api/v1/finance",
];

export const GATED_PAGE_PREFIXES = [
  "/tickets",
  "/leave",
  "/attendance",
  "/payroll",
  "/requests",
  "/projects",
  "/work",
  "/shifts",
  "/goals",
  "/finance",
];

export function isGatedApiPath(pathname: string): boolean {
  return GATED_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isGatedPagePath(pathname: string): boolean {
  return GATED_PAGE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isMfaAllowedPath(pathname: string): boolean {
  return (
    pathname.startsWith("/settings/security") ||
    pathname.startsWith("/api/v1/me/mfa") ||
    pathname.startsWith("/api/v1/auth/logout") ||
    pathname.startsWith("/api/v1/health") ||
    pathname.startsWith("/api/v1/me")
  );
}
