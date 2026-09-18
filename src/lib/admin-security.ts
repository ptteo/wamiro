/**
 * G-28 — single source of truth for security-related audit actions.
 *
 * The audit page's quick-filter chips, the admin console's security strip and
 * the security center all derive from the groups below, so an action list can
 * never drift between surfaces: a new action is added to exactly one group
 * and every chip picks it up.
 */

/** Audit actions that belong on the Security center / Admin console strip. */
export const SECURITY_AUDIT_ACTIONS = [
  "USER_SUSPENDED",
  "USER_REACTIVATED",
  "USER_INVITED",
  "PERMISSION_GRANTED",
  "PERMISSION_DENIED",
  "PERMISSION_REVOKED",
  "SESSION_REVOKED",
  "SESSIONS_REVOKED_ALL",
  "MFA_ENABLED",
  "MFA_DISABLED",
  "MFA_FAILED",
  "LOGIN_FAILED",
  "ROLE_ASSIGNED",
  "ROLE_REMOVED",
  "ACCESS_REVIEWED",
] as const;

export const SECURITY_AUDIT_QUERY = SECURITY_AUDIT_ACTIONS.join(",");

/** Action groups shared by the audit page chips and any other filter UI. */
export interface AuditActionGroup {
  key: string;
  label: string;
  actions: readonly string[];
  tone: "neutral" | "warning" | "danger";
}

export const AUDIT_ACTION_GROUPS: AuditActionGroup[] = [
  {
    key: "security",
    label: "Security events",
    actions: SECURITY_AUDIT_ACTIONS,
    tone: "danger",
  },
  {
    key: "signins",
    label: "Sign-ins & lockouts",
    actions: ["USER_LOGIN", "LOGIN_FAILED", "MFA_FAILED"],
    tone: "warning",
  },
  {
    key: "access",
    label: "Access changes",
    actions: ["ROLE_ASSIGNED", "ROLE_REMOVED", "PERMISSION_GRANTED", "PERMISSION_DENIED", "PERMISSION_REVOKED"],
    tone: "neutral",
  },
  {
    key: "lifecycle",
    label: "User lifecycle",
    actions: ["USER_INVITED", "INVITE_ACCEPTED", "INVITE_REVOKED", "USER_SUSPENDED", "USER_REACTIVATED", "SESSIONS_REVOKED_ALL"],
    tone: "neutral",
  },
  {
    key: "exports",
    label: "Data exports",
    actions: ["DATA_EXPORTED", "PAYROLL_BANK_EXPORTED", "PLATFORM_OPS_EXPORT"],
    tone: "neutral",
  },
  {
    key: "mfa",
    label: "MFA",
    actions: ["MFA_ENABLED", "MFA_DISABLED", "MFA_FAILED"],
    tone: "neutral",
  },
];

/** Comma-joined query value for a group's actions (the service ORs these). */
export function auditGroupQuery(g: AuditActionGroup): string {
  return g.actions.join(",");
}
