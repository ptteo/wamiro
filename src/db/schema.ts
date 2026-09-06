/**
 * Wamiro database schema.
 *
 * Tenancy rule (enforced in code review + module layer):
 * every tenant-owned table has organization_id and every query derives it
 * from the authenticated session — never from client input.
 * organization_id = NULL rows are platform-level (e.g. platform roles, audits).
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  char,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import type { PermissionScope } from "@/modules/iam/catalog";

// ---------- enums ----------

export const orgStatusEnum = pgEnum("org_status", ["active", "suspended"]);
export const userStatusEnum = pgEnum("user_status", [
  "invited",
  "active",
  "suspended",
]);
export const employmentStatusEnum = pgEnum("employment_status", [
  "active",
  "on_leave",
  "offboarding",
  "inactive",
]);
export const leaveStatusEnum = pgEnum("leave_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "cancel_requested",
]);
export const attendanceCorrectionStatusEnum = pgEnum("attendance_correction_status", [
  "pending",
  "approved",
  "rejected",
]);
export const attendanceCorrectionTypeEnum = pgEnum("attendance_correction_type", [
  "clock_in",
  "clock_out",
  "missing",
]);
export const scopeEnum = pgEnum("permission_scope", [
  "SELF",
  "TEAM",
  "DEPARTMENT",
  "COMPANY",
  "GLOBAL",
]);
export const overrideEffectEnum = pgEnum("override_effect", ["allow", "deny"]);

export interface RequestTypeField {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select";
  required?: boolean;
  options?: string[];
}

/** One ordered step of a request-type approval chain. */
export interface WorkflowStepDef {
  label: string;
  approverMode: "manager" | "company";
}

// ---------- tenancy ----------

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: orgStatusEnum("status").notNull().default("active"),
    logoUrl: text("logo_url"),
    primaryColor: text("primary_color").notNull().default("#4f46e5"),
    secondaryColor: text("secondary_color").notNull().default("#0f172a"),
    timezone: text("timezone").notNull().default("UTC"),
    locale: text("locale").notNull().default("en"),
    currency: text("currency").notNull().default("USD"),
    dateFormat: text("date_format").notNull().default("YYYY-MM-DD"),
    /** Module switches; keys validated against src/modules/iam/catalog MODULES */
    modules: jsonb("modules")
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),
    /** SaaS plan tier: starter | growth | scale (see src/modules/billing/plans). */
    plan: text("plan").notNull().default("starter"),
    /** Subscription lifecycle: trial | active | past_due | cancelled. */
    billingStatus: text("billing_status").notNull().default("active"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    /** Seat cap override — NULL means the plan's seat limit applies. */
    seatLimit: integer("seat_limit"),
    /** Payment provider key once billing is wired (stripe, paddle…). */
    billingProvider: text("billing_provider"),
    billingCustomerId: text("billing_customer_id"),
    billingSubscriptionId: text("billing_subscription_id"),
    /** SCIM 2.0 provisioning (Phase C): enabled flag + hashed bearer token. */
    scimEnabled: boolean("scim_enabled").notNull().default(false),
    scimTokenHash: text("scim_token_hash"),
    /** White-label (Phase D): company-owned CNAME domain, lazily verified. */
    customDomain: text("custom_domain"),
    customDomainVerified: boolean("custom_domain_verified").notNull().default(false),
    /** Phase 1 — empty = any domain. Compared case-insensitively to the email host. */
    allowedEmailDomains: jsonb("allowed_email_domains").$type<string[]>().notNull().default([]),
    /** optional | required_admins | required_all */
    mfaMode: text("mfa_mode").notNull().default("optional"),
    /** self_service | managed */
    passwordMode: text("password_mode").notNull().default("self_service"),
    /** pending | admin_done | employees_seeded | complete. Existing orgs stay complete. */
    onboardingState: text("onboarding_state").notNull().default("complete"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("organizations_slug_key").on(t.slug),
    uniqueIndex("organizations_custom_domain_key")
      .on(t.customDomain)
      .where(sql`${t.customDomain} IS NOT NULL`),
    index("organizations_slug_lookup_idx").on(t.slug),
  ],
);

// ---------- identity ----------

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    avatarUrl: text("avatar_url"),
    status: userStatusEnum("status").notNull().default("active"),
    /** Throttled last-activity stamp (activation analytics; see session.ts). */
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    /** password | sso — governs which auth path may sign this identity in. */
    authMethod: text("auth_method").notNull().default("password"),
    /** Subject claim from the last successful SSO login (account matching). */
    ssoSub: text("sso_sub"),
    /** TOTP (blueprint §57): present once setup begins; trusted only when totpEnabled */
    totpSecret: text("totp_secret"),
    totpEnabled: boolean("totp_enabled").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    /** Phase 1 — account lockout after repeated failed logins. */
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_key").on(t.email),
    index("users_org_idx").on(t.organizationId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** R2 §8/§11 — tenant this session currently operates in (defaults to home org). */
    activeOrganizationId: uuid("active_organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
  },
  (t) => [
    uniqueIndex("sessions_token_key").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
  ],
);

export const invitationTokens = pgTable(
  "invitation_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    roleKey: text("role_key").notNull(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    managerUserId: uuid("manager_user_id").references(() => users.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invitation_tokens_hash_key").on(t.tokenHash),
    index("invitation_tokens_org_idx").on(t.organizationId),
    index("invitation_tokens_email_idx").on(t.organizationId, t.email),
  ],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("password_reset_tokens_hash_key").on(t.tokenHash),
    index("password_reset_tokens_user_idx").on(t.userId),
  ],
);

export const passwordChangeRequests = pgTable(
  "password_change_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("password_change_requests_org_idx").on(t.organizationId, t.status)],
);

// ---------- D14 Workplace: resources + bookings ----------

export const workplaceResources = pgTable(
  "workplace_resources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** room | desk | resource */
    kind: text("kind").notNull().default("room"),
    name: text("name").notNull(),
    location: text("location"),
    capacity: integer("capacity"),
    features: jsonb("features").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("active"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("wp_resources_org_idx").on(t.organizationId, t.kind)],
);

export const workplaceBookings = pgTable(
  "workplace_bookings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => workplaceResources.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("booked"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("wp_bookings_resource_idx").on(t.resourceId, t.startsAt), index("wp_bookings_user_idx").on(t.userId)],
);

// ---------- D14 Workplace: visitors ----------

export const workplaceVisitors = pgTable(
  "workplace_visitors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    hostUserId: uuid("host_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    visitDate: date("visit_date").notNull(),
    /** invited | checked_in | checked_out | cancelled */
    status: text("status").notNull().default("invited"),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    checkedOutAt: timestamp("checked_out_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("wp_visitors_org_date_idx").on(t.organizationId, t.visitDate)],
);

// ---------- R5: personal user configuration (§17) ----------

export const userPreferences = pgTable(
  "user_preferences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** NULL = global preference; set = tenant-scoped preference */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    key: text("key").notNull(),
    value: jsonb("value").$type<unknown>(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("prefs_user_idx").on(t.userId),
    uniqueIndex("prefs_global_key").on(t.userId, t.key).where(sql`organization_id IS NULL`),
    uniqueIndex("prefs_tenant_key").on(t.userId, t.organizationId, t.key),
  ],
);

// ---------- Phase F: background jobs ledger (worker freshness for health) ----------

export const platformJobRuns = pgTable("platform_job_runs", {
  /** 'sla_sweep' | 'trial_sweep' | 'request_escalation' | 'governance_sweep' | 'mailbox_poll' */
  job: text("job").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  ok: boolean("ok").notNull().default(false),
  detail: jsonb("detail"),
});

// ---------- Phase E: audited impersonation (consent-gated, platform-only) ----------

/**
 * One support-impersonation window. A grant is created (and later revoked)
 * BY THE TENANT admin — the platform operator can never self-serve access to
 * a tenant that has not explicitly opted in. Sessions minted under a grant
 * carry the grant id for the banner and the audit trail.
 */
export const impersonationGrants = pgTable(
  "impersonation_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Tenant that granted access. */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Tenant admin who approved the grant (consent). */
    grantedByUserId: uuid("granted_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Optional named platform operator at grant time (informational). */
    operatorLabel: text("operator_label"),
    reason: text("reason").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("impersonation_grants_org_idx").on(t.organizationId, t.revokedAt),
    index("impersonation_grants_expiry_idx").on(t.expiresAt),
  ],
);

/** One impersonation window actually opened under a grant (audit ledger). */
export const impersonationSessions = pgTable(
  "impersonation_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    grantId: uuid("grant_id")
      .notNull()
      .references(() => impersonationGrants.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    operatorUserId: uuid("operator_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetUserId: uuid("target_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 of the minted session token — lets "stop" find the live row. */
    sessionTokenHash: text("session_token_hash").notNull(),
    /** SHA-256 of the operator's fresh "return" session, stored httpOnly. */
    operatorReturnTokenHash: text("operator_return_token_hash").notNull(),
    reason: text("reason").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("impersonation_sessions_token_key").on(t.sessionTokenHash),
    index("impersonation_sessions_org_idx").on(t.organizationId, t.startedAt),
  ],
);

// ---------- D15 Governance: policies, risks, controls, obligations ----------

export const govPolicies = pgTable(
  "gov_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    /** draft | active | retired */
    status: text("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    effectiveAt: date("effective_at"),
    reviewAt: date("review_at"),
    /** optional link into the Knowledge workspace (no duplicate content store) */
    articleId: uuid("article_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("gov_policies_org_idx").on(t.organizationId, t.status)],
);

export const govRisks = pgTable(
  "gov_risks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: text("category"),
    /** low | medium | high | critical */
    impact: text("impact").notNull().default("medium"),
    likelihood: text("likelihood").notNull().default("medium"),
    /** open | mitigated | accepted | closed */
    status: text("status").notNull().default("open"),
    mitigation: text("mitigation"),
    reviewAt: date("review_at"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("gov_risks_org_idx").on(t.organizationId, t.status)],
);

export const govControls = pgTable(
  "gov_controls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** planned | partial | implemented */
    status: text("status").notNull().default("planned"),
    /** pass | fail | not_tested */
    result: text("result").notNull().default("not_tested"),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("gov_controls_org_idx").on(t.organizationId)],
);

export const govObligations = pgTable(
  "gov_obligations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    dueAt: date("due_at"),
    /** open | met */
    status: text("status").notNull().default("open"),
    notes: text("notes"),
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("gov_obligations_org_idx").on(t.organizationId, t.status)],
);

// ---------- R2: a person can belong to many organizations ----------

/**
 * Per-organization AI tool allow-list (D11/§100). Confidential tools
 * default to disabled; admins opt them in. The assistant reads this
 * table on every chat turn and refuses to declare or call a tool that
 * is disabled for the active org.
 */
export const aiToolPolicies = pgTable(
  "ai_tool_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** matches the tool's `name` in src/modules/ai/tools.ts */
    toolName: text("tool_name").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    /** who toggled the policy and when */
    setByUserId: uuid("set_by_user_id").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ai_tool_policies_org_tool_key").on(t.organizationId, t.toolName),
    index("ai_tool_policies_org_idx").on(t.organizationId),
  ],
);

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** active | suspended */
    status: text("status").notNull().default("active"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("memberships_user_org_key").on(t.userId, t.organizationId)],
);

// ---------- org structure ----------

export const departments = pgTable(
  "departments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    parentDepartmentId: uuid("parent_department_id").references(
      (): AnyPgColumn => departments.id,
    ),
    managerUserId: uuid("manager_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("departments_org_idx").on(t.organizationId)],
);

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    departmentId: uuid("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("teams_org_idx").on(t.organizationId)],
);

/** Team membership is the basis of TEAM-scope authorization. */
export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [
    // ponytail: primary-key-style composite unique; drizzle pk on two uuids works too
    uniqueIndex("team_members_key").on(t.teamId, t.userId),
    index("team_members_user_idx").on(t.userId),
  ],
);

// ---------- IAM ----------

/** organization_id NULL = platform role (Super Admin). */
export const roles = pgTable(
  "roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").references(
      () => organizations.id,
      { onDelete: "cascade" },
    ),
    key: text("key").notNull(), // stable machine key, e.g. 'manager'
    name: text("name").notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("roles_org_key").on(t.organizationId, t.key),
    index("roles_org_idx").on(t.organizationId),
  ],
);

/** Grants from roles: role → permission @ scope. Editable by tenant admins. */
export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
    scope: scopeEnum("scope").notNull().default("COMPANY"),
  },
  (t) => [uniqueIndex("role_permissions_key").on(t.roleId, t.permission, t.scope)],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    grantedBy: uuid("granted_by"),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("user_roles_key").on(t.userId, t.roleId),
    index("user_roles_role_idx").on(t.roleId),
  ],
);

/** Direct per-user grants/denies. Precedence: deny > allow-override > role. */
export const userPermissionOverrides = pgTable(
  "user_permission_overrides",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(
      () => organizations.id,
      { onDelete: "cascade" },
    ),
    permission: text("permission").notNull(),
    effect: overrideEffectEnum("effect").notNull(),
    scope: scopeEnum("scope").notNull().default("COMPANY"),
    reason: text("reason").notNull(),
    grantedBy: uuid("granted_by"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("overrides_user_idx").on(t.userId)],
);

// ---------- people ----------

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    employeeCode: text("employee_code"),
    jobTitle: text("job_title"),
    departmentId: uuid("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    managerUserId: uuid("manager_user_id").references(
      (): AnyPgColumn => users.id,
      { onDelete: "set null" },
    ),
    employmentType: text("employment_type").notNull().default("full_time"),
  phone: text("phone"),
  emergencyContact: text("emergency_contact"),
  address: text("address"),
    status: employmentStatusEnum("status").notNull().default("active"),
    /** values keyed by custom_field_defs.key */
    customFields: jsonb("custom_fields")
      .$type<Record<string, string | number | null>>()
      .notNull()
      .default({}),
    hiredAt: date("hired_at"),
    /** Departure date — stamped when employment ends (attrition source). */
    leftAt: date("left_at"),
    bankName: text("bank_name"),
    bankAccountNo: text("bank_account_no"),
    ifscCode: text("ifsc_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("employees_org_user_key").on(t.organizationId, t.userId),
    index("employees_org_idx").on(t.organizationId),
    index("employees_manager_idx").on(t.managerUserId),
  ],
);

// ---------- audit ----------

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    organizationId: uuid("organization_id"), // NULL = platform-level event
    actorUserId: uuid("actor_user_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    metadata: jsonb("metadata"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    requestId: text("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_org_created_idx").on(t.organizationId, t.createdAt),
    index("audit_actor_idx").on(t.actorUserId),
  ],
);

// ---------- attendance (HR-lite, Wamiro-owned) ----------

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clockIn: timestamp("clock_in", { withTimezone: true }).notNull().defaultNow(),
    clockOut: timestamp("clock_out", { withTimezone: true }),
    source: text("source").notNull().default("web"),
    note: text("note"),
    shiftTypeId: uuid("shift_type_id").references(() => shiftTypes.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("attendance_user_in_idx").on(t.userId, t.clockIn),
    index("attendance_org_in_idx").on(t.organizationId, t.clockIn),
    index("attendance_shift_idx").on(t.shiftTypeId),
    // one open shift per user
    uniqueIndex("attendance_open_key").on(t.userId).where(sql`clock_out IS NULL`),
  ],
);

// ---------- leave (HR-lite, Wamiro-owned) ----------

export const leaveTypes = pgTable(
  "leave_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    annualQuotaDays: numeric("annual_quota_days", { precision: 5, scale: 1 })
      .notNull()
      .default("20"),
    paid: boolean("paid").notNull().default(true),
    /** Frappe parity: when true, the annual quota is granted automatically on hire and each new year. */
    autoAllocate: boolean("auto_allocate").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("leave_types_org_idx").on(t.organizationId)],
);

export const leaveBalances = pgTable(
  "leave_balances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    leaveTypeId: uuid("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    entitledDays: numeric("entitled_days", { precision: 5, scale: 1 })
      .notNull()
      .default("0"),
    usedDays: numeric("used_days", { precision: 5, scale: 1 })
      .notNull()
      .default("0"),
  },
  (t) => [
    uniqueIndex("leave_balances_key").on(t.userId, t.leaveTypeId, t.year),
  ],
);

export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    leaveTypeId: uuid("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id, { onDelete: "restrict" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    days: numeric("days", { precision: 5, scale: 1 }).notNull(),
    reason: text("reason"),
    status: leaveStatusEnum("status").notNull().default("pending"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("leave_req_org_status_idx").on(t.organizationId, t.status),
    index("leave_req_user_idx").on(t.userId),
  ],
);

// ---------- announcements ----------

export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    audience: text("audience").notNull().default("company"),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("announcements_org_published_idx").on(t.organizationId, t.publishedAt)],
);

// ---------- notifications ----------

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // e.g. leave.requested, leave.approved
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("notifications_user_created_idx").on(t.userId, t.createdAt),
    index("notifications_unread_idx").on(t.userId).where(sql`read_at IS NULL`),
  ],
);

// ---------- generic requests (Request Center) ----------

/** Tenant-defined request types with schema-driven forms. */
export const requestTypes = pgTable(
  "request_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** Field defs: [{key,label,type:'text'|'textarea'|'number'|'date'|'select',required?,options?[]}] */
    fields: jsonb("fields").$type<RequestTypeField[]>().notNull().default([]),
    /** Who approves: requester's direct manager or company-level approvers */
    approverMode: text("approver_mode").notNull().default("manager"), // 'manager' | 'company'
slaHours: integer("sla_hours"), // R8 §32: decision SLA window for this request type
    /** Optional ordered approval chain: [{label,approverMode,userId?}] — overrides approverMode when set */
    steps: jsonb("steps").$type<WorkflowStepDef[]>().notNull().default([]),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("request_types_org_key").on(t.organizationId, t.key)],
);

export const requests = pgTable(
  "requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    typeId: uuid("type_id")
      .notNull()
      .references(() => requestTypes.id, { onDelete: "restrict" }),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    payload: jsonb("payload").$type<Record<string, string | number | null>>().notNull(),
    status: leaveStatusEnum("status").notNull().default("pending"),
    slaDueAt: timestamp("sla_due_at", { withTimezone: true }),
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    /** Ordered approvals already given (workflow lite): [{stepIndex,approverId}] */
    approvedSteps: jsonb("approved_steps")
      .$type<{ stepIndex: number; approverId: string }[]>()
      .notNull()
      .default([]),
    currentStep: integer("current_step").notNull().default(0),
    reviewedBy: uuid("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("requests_org_status_idx").on(t.organizationId, t.status),
    index("requests_requester_idx").on(t.requesterId),
  ],
);

// ---------- documents ----------

/**
 * File metadata only — bytes live behind the storage adapter
 * (src/lib/storage.ts), keyed as tenant/{organizationId}/documents/{uuid}.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 'company' | 'policy' | 'personal' */
    category: text("category").notNull().default("company"),
    /** For personal docs: whose document it is */
    ownerUserId: uuid("owner_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull().default("application/octet-stream"),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("documents_org_created_idx").on(t.organizationId, t.createdAt),
    index("documents_owner_idx").on(t.ownerUserId),
  ],
);

// ---------- knowledge ----------

export const knowledgeArticles = pgTable(
  "knowledge_articles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    /** Markdown-ish plain text; rendered as pre-wrap text in v1 */
    body: text("body").notNull(),
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("knowledge_org_created_idx").on(t.organizationId, t.createdAt)],
);

// ---------- work: projects & tasks ----------

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** 'active' | 'completed' | 'archived' */
    status: text("status").notNull().default("active"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Phase 2 — sample rows seeded during onboarding; safe to purge. */
    demo: boolean("demo").notNull().default(false),
  },
  (t) => [index("projects_org_idx").on(t.organizationId, t.status)],
);

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("project_members_key").on(t.projectId, t.userId),
    index("project_members_user_idx").on(t.userId),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** null = personal task, not tied to a project */
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    description: text("description"),
    /** 'todo' | 'in_progress' | 'done' */
    status: text("status").notNull().default("todo"),
    /** 'low' | 'medium' | 'high' */
    priority: text("priority").notNull().default("medium"),
    assigneeId: uuid("assignee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dueDate: date("due_date"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentTaskId: uuid("parent_task_id").references((): AnyPgColumn => tasks.id, {
      onDelete: "cascade",
    }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("tasks_org_status_idx").on(t.organizationId, t.status),
    index("tasks_assignee_idx").on(t.assigneeId),
    index("tasks_project_idx").on(t.projectId),
  ],
);

// ---------- company calendar ----------

export const holidays = pgTable(
  "holidays",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    date: date("date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("holidays_org_date_key").on(t.organizationId, t.date)],
);

// ---------- time tracking ----------

export const timeLogs = pgTable(
  "time_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    logDate: date("log_date").notNull(),
    minutes: integer("minutes").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("time_logs_task_idx").on(t.taskId),
    index("time_logs_user_date_idx").on(t.userId, t.logDate),
  ],
);

// ---------- surveys & polls ----------

export const surveys = pgTable(
  "surveys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    options: text("options").array().notNull().default(sql`ARRAY[]::text[]`),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** null = open indefinitely */
    closesAt: timestamp("closes_at", { withTimezone: true }),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("surveys_org_idx").on(t.organizationId, t.createdAt)],
);

export const surveyVotes = pgTable(
  "survey_votes",
  {
    surveyId: uuid("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    optionIndex: integer("option_index").notNull(),
    votedAt: timestamp("voted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("survey_votes_key").on(t.surveyId, t.userId)],
);

// ---------- acknowledgements (e-sign-lite) ----------

export const acknowledgements = pgTable(
  "acknowledgements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("acknowledgements_org_idx").on(t.organizationId, t.createdAt)],
);

export const acknowledgementSignatures = pgTable(
  "acknowledgement_signatures",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    acknowledgementId: uuid("acknowledgement_id")
      .notNull()
      .references(() => acknowledgements.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Full typed name captured at signing time */
    signatureName: text("signature_name").notNull(),
    ip: text("ip"),
    signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ack_signature_key").on(t.acknowledgementId, t.userId),
    index("ack_signature_user_idx").on(t.userId),
  ],
);

// ---------- favorites (saved items) ----------

export const favorites = pgTable(
  "favorites",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 'project' | 'article' */
    kind: text("kind").notNull(),
    refId: uuid("ref_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("favorites_key").on(t.userId, t.kind, t.refId),
    index("favorites_user_idx").on(t.userId),
  ],
);

// ---------- assets (IT inventory) ----------

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** 'laptop' | 'phone' | 'monitor' | 'other' */
    category: text("category").notNull().default("other"),
    serialNumber: text("serial_number"),
    notes: text("notes"),
    /** current holder; null = in stock */
    assignedToUserId: uuid("assigned_to_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("assets_org_idx").on(t.organizationId),
    index("assets_assignee_idx").on(t.assignedToUserId),
  ],
);

// ---------- dashboards (BI-lite) ----------

export const dashboardWidgets = pgTable(
  "dashboard_widgets",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    metricId: text("metric_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("dashboard_widgets_key").on(t.userId, t.metricId)],
);

// ---------- automation rules ----------

export const automationRules = pgTable(
  "automation_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** v1: fires on request.created */
    eventType: text("event_type").notNull().default("request.created"),
    /** null = any request type */
    requestTypeId: uuid("request_type_id").references(() => requestTypes.id, {
      onDelete: "cascade",
    }),
    /** Condition on a numeric payload field: fieldKey op value */
    conditionField: text("condition_field"),
    conditionOp: text("condition_op").notNull().default("gt"), // gt|lt|gte|lte|eq
    conditionValue: numeric("condition_value", { precision: 14, scale: 2 }),
    /** Extra emails to notify when the rule matches */
    notifyEmails: text("notify_emails").array().notNull().default(sql`ARRAY[]::text[]`),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("automation_rules_org_idx").on(t.organizationId)],
);

// ---------- employee custom fields ----------

export const customFieldDefs = pgTable(
  "custom_field_defs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    /** 'text' | 'number' | 'date' */
    type: text("type").notNull().default("text"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("custom_field_defs_key").on(t.organizationId, t.key)],
);

// ---------- goals & OKRs ----------

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    /** 'active' | 'done' | 'archived' */
    status: text("status").notNull().default("active"),
    progress: integer("progress").notNull().default(0), // 0–100
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dueDate: date("due_date"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("goals_org_status_idx").on(t.organizationId, t.status)],
);

// ---------- platform foundation: events & idempotency ----------

/** Domain events (§50): append-only stream for future automation/analytics. */
export const domainEvents = pgTable(
  "domain_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    organizationId: uuid("organization_id"),
    eventType: text("event_type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    actorUserId: uuid("actor_user_id"),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("domain_events_org_idx").on(t.organizationId, t.createdAt),
    index("domain_events_type_idx").on(t.eventType),
  ],
);

/** Idempotency keys (§51): replay protection for retried mutations. */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    key: text("key").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    responseStatus: integer("response_status").notNull(),
    responseBody: jsonb("response_body"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idempotency_created_idx").on(t.createdAt)],
);

// ---------- task comments (D3 §22) ----------

export const taskComments = pgTable(
  "task_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("task_comments_task_idx").on(t.taskId, t.createdAt)],
);

export const goalComments = pgTable(
  "goal_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("goal_comments_goal_idx").on(t.goalId, t.createdAt)],
);

// ---------- discussions ----------

export const discussions = pgTable(
  "discussions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 'company' | 'team' | 'project' | 'department' */
    scope: text("scope").notNull().default("company"),
    scopeId: uuid("scope_id"),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("discussions_org_idx").on(t.organizationId, t.createdAt)],
);

export const discussionReplies = pgTable(
  "discussion_replies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    discussionId: uuid("discussion_id")
      .notNull()
      .references(() => discussions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("replies_discussion_idx").on(t.discussionId, t.createdAt)],
);

// ---------- shared comments ----------

/** Polymorphic comments attachable to any entity via entityType + entityId. */
export const comments = pgTable(
  "comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("comments_entity_idx").on(t.entityType, t.entityId, t.createdAt),
    index("comments_user_idx").on(t.userId),
  ],
);

// ---------- support tickets ----------

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    /** 'incident' | 'service_request' | 'access' | 'hardware' | 'software' | 'platform' | 'other' */
    category: text("category").notNull().default("other"),
    /** 'low' | 'medium' | 'high' | 'urgent' */
    priority: text("priority").notNull().default("medium"),
    /** 'new' | 'open' | 'waiting' | 'resolved' | 'closed' */
    status: text("status").notNull().default("new"),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assigneeId: uuid("assignee_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Resolution SLA deadline (per-priority window from creation). */
    slaDueDate: timestamp("sla_due_date", { withTimezone: true }),
    /** First-response SLA deadline (per-priority window from creation). */
    firstResponseDueAt: timestamp("first_response_due_at", { withTimezone: true }),
    /** Stamped once when an agent (tickets.manage) posts the first reply. */
    firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
    /** 'ok' | 'at_risk' | 'breached' — derived on read, persisted by sweep/mutations. */
    slaState: text("sla_state").notNull().default("ok"),
    /** Guards the one-time SLA-at-risk notification. */
    slaWarningNotifiedAt: timestamp("sla_warning_notified_at", { withTimezone: true }),
    /** Guards the one-time SLA-breach notification. */
    breachNotifiedAt: timestamp("breach_notified_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    /** CSAT (1–5) submitted by the requester after resolution. */
    csatScore: integer("csat_score"),
    csatComment: text("csat_comment"),
    /** Routing group (F2.5). */
    groupId: uuid("group_id").references(() => ticketGroups.id, {
      onDelete: "set null",
    }),
    /** Related knowledge article ids (F2.6). */
    relatedKnowledgeIds: uuid("related_knowledge_ids").array().notNull().default([]),
    /** Phase E: when platform ops pulled this ticket into their support queue. */
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Phase 2 — sample rows seeded during onboarding; safe to purge. */
    demo: boolean("demo").notNull().default(false),
  },
  (t) => [
    index("tickets_org_status_idx").on(t.organizationId, t.status),
    index("tickets_requester_idx").on(t.requesterId),
    index("tickets_assignee_idx").on(t.assigneeId),
    index("tickets_sla_state_idx").on(t.organizationId, t.slaState),
    index("tickets_sla_due_idx").on(t.organizationId, t.slaDueDate),
    index("tickets_escalated_idx").on(t.escalatedAt),
  ],
);

export const ticketReplies = pgTable(
  "ticket_replies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    /** internal notes visible only to agents; false = customer-facing reply */
    isInternal: boolean("is_internal").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("replies_ticket_idx").on(t.ticketId, t.createdAt)],
);

export const ticketAttachments = pgTable(
  "ticket_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    replyId: uuid("reply_id").references(() => ticketReplies.id, {
      onDelete: "set null",
    }),
    fileKey: text("file_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ticket_attachments_ticket_idx").on(t.ticketId),
    index("ticket_attachments_org_idx").on(t.organizationId),
  ],
);

export const ticketGroups = pgTable(
  "ticket_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ticket_groups_org_name_key").on(t.organizationId, sql`lower(${t.name})`),
  ],
);

export const ticketGroupMembers = pgTable(
  "ticket_group_members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => ticketGroups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] }), index("ticket_group_members_user_idx").on(t.userId)],
);

// ---------- agent toolkit (Phase 7, Zammad parity) ----------

export const ticketTags = pgTable(
  "ticket_tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ticket_tags_org_ticket_name").on(t.organizationId, t.ticketId, t.name),
    index("ticket_tags_ticket_idx").on(t.ticketId),
  ],
);

export const ticketTimeEntries = pgTable(
  "ticket_time_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    minutes: integer("minutes").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ticket_time_ticket_idx").on(t.ticketId, t.createdAt)],
);

export const ticketLinks = pgTable(
  "ticket_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    linkedTicketId: uuid("linked_ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    /** 'related' | 'blocks' | 'duplicates' */
    relation: text("relation").notNull().default("related"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ticket_links_unique").on(t.organizationId, t.ticketId, t.linkedTicketId, t.relation),
    index("ticket_links_ticket_idx").on(t.ticketId),
    index("ticket_links_linked_idx").on(t.linkedTicketId),
  ],
);

export const cannedResponses = pgTable(
  "canned_responses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category"),
    body: text("body").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("canned_responses_org_idx").on(t.organizationId, t.name)],
);

export const ticketMacros = pgTable(
  "ticket_macros",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** JSON array of { op, value } — set_status | set_priority | assign | add_tag | add_reply | add_note */
    actions: jsonb("actions").notNull().default([]),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ticket_macros_org_idx").on(t.organizationId, t.name)],
);

export const assignmentRules = pgTable(
  "assignment_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    groupId: uuid("group_id").references(() => ticketGroups.id, {
      onDelete: "set null",
    }),
    category: text("category"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("assignment_rules_org_idx").on(t.organizationId, t.active)],
);

// ---------- enterprise trust (Phase C) ----------

export const webhooks = pgTable(
  "webhooks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    /** DomainEventType list this webhook receives; empty = all. */
    events: text("events").array().notNull().default([]),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    lastStatus: integer("last_status"),
    lastError: text("last_error"),
    lastDeliveredAt: timestamp("last_delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("webhooks_org_idx").on(t.organizationId, t.active)],
);

export const ssoConfigs = pgTable(
  "sso_configs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** 'oidc' | 'saml' (saml stored; execution via IdP bridge). */
    provider: text("provider").notNull().default("oidc"),
    issuer: text("issuer").notNull(),
    clientId: text("client_id"),
    clientSecret: text("client_secret"),
    discoveryUrl: text("discovery_url"),
    metadataUrl: text("metadata_url"),
    enabled: boolean("enabled").notNull().default(false),
    /** Auto-create the user on first successful SSO login. */
    jitProvision: boolean("jit_provision").notNull().default(false),
    defaultRoleKey: text("default_role_key").notNull().default("employee"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("sso_configs_org_unique").on(t.organizationId)],
);

export const ssoStates = pgTable(
  "sso_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    state: text("state").notNull().unique(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    nonce: text("nonce").notNull(),
    /** PKCE verifier (plaintext, one-time, 10-min TTL). */
    codeVerifier: text("code_verifier"),
    redirectTo: text("redirect_to"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("sso_states_expiry_idx").on(t.expiresAt)],
);

export const serviceItems = pgTable(
  "service_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category").notNull().default("other"),
    icon: text("icon"),
    expectedDays: integer("expected_days"),
    approvalRequired: boolean("approval_required").notNull().default(true),
    autoCreateTicket: boolean("auto_create_ticket").notNull().default(false),
    requestTypeId: uuid("request_type_id").references(() => requestTypes.id, {
      onDelete: "set null",
    }),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("service_items_org_idx").on(t.organizationId, t.active)],
);

export const itRecords = pgTable(
  "it_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** 'incident' | 'problem' | 'change' */
    type: text("type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    impact: text("impact"),
    priority: text("priority").notNull().default("medium"),
    status: text("status").notNull().default("new"),
    ownerId: uuid("owner_id").references(() => users.id, {
      onDelete: "set null",
    }),
    affectedService: text("affected_service"),
    windowStart: timestamp("window_start", { withTimezone: true }),
    windowEnd: timestamp("window_end", { withTimezone: true }),
    risk: text("risk"),
    ticketIds: uuid("ticket_ids").array().notNull().default([]),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("it_records_org_type_idx").on(t.organizationId, t.type),
    index("it_records_org_status_idx").on(t.organizationId, t.status),
  ],
);

export const mailboxMessages = pgTable(
  "mailbox_messages",
  {
    messageKey: text("message_key").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    mailboxId: uuid("mailbox_id").references(() => mailboxes.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("mailbox_messages_org_idx").on(t.organizationId)],
);

export const mailboxes = pgTable(
  "mailboxes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    imapHost: text("imap_host").notNull(),
    imapPort: integer("imap_port").notNull().default(993),
    imapUser: text("imap_user").notNull(),
    imapPass: text("imap_pass").notNull(),
    useSsl: boolean("use_ssl").notNull().default(true),
    enabled: boolean("enabled").notNull().default(true),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("mailboxes_org_idx").on(t.organizationId)],
);

// ---------- AI conversations ----------

export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New conversation"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ai_conv_user_idx").on(t.userId, t.createdAt)],
);

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ai_msg_conv_idx").on(t.conversationId, t.createdAt)],
);

// ---------- subtasks, saved views, delegations ----------

export const savedViews = pgTable(
  "saved_views",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspace: text("workspace").notNull(),
    name: text("name").notNull(),
    filters: jsonb("filters")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("saved_views_key").on(t.userId, t.workspace, t.name)],
);

export const approvalDelegations = pgTable(
  "approval_delegations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Who is delegating their approval authority */
    delegatorId: uuid("delegator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Who receives the authority */
    delegateId: uuid("delegate_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [index("delegation_delegator_idx").on(t.delegatorId, t.active)],
);

// re-export scope type consumers expect
export type { PermissionScope };

// ============================================================================
// D12 — Finance & procurement
// ============================================================================

export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category"),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    /** active | pending | inactive | blocked */
    status: text("status").notNull().default("pending"),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("vendors_org_idx").on(t.organizationId, t.name)],
);

export const vendorDocuments = pgTable(
  "vendor_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    /** license | insurance | cert | other */
    kind: text("kind").notNull().default("other"),
    expiresAt: date("expires_at"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("vendor_docs_vendor_idx").on(t.vendorId)],
);

export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    periodLabel: text("period_label").notNull(), // e.g. 2026 or 2026-Q1
    amountCents: bigint("amount_cents", { mode: "number" }).notNull().default(0),
    currency: char("currency", { length: 3 }).notNull().default("USD"),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    spentCents: bigint("spent_cents", { mode: "number" }).notNull().default(0),
    /** draft | active | closed */
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("budgets_org_idx").on(t.organizationId, t.status)],
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    submittedBy: uuid("submitted_by").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: text("category").notNull().default("other"),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("USD"),
    incurredAt: date("incurred_at").notNull(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    costCenter: text("cost_center"),
    budgetId: uuid("budget_id").references(() => budgets.id, { onDelete: "set null" }),
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    travelRequestId: uuid("travel_request_id"),
    receiptDocumentId: uuid("receipt_document_id").references(() => documents.id, { onDelete: "set null" }),
    /** draft | submitted | approved | rejected | reimbursed | canceled */
    status: text("status").notNull().default("draft"),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    reimbursedAt: timestamp("reimbursed_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("expenses_org_status_idx").on(t.organizationId, t.status),
    index("expenses_submitter_idx").on(t.submittedBy),
  ],
);

export const purchaseRequests = pgTable(
  "purchase_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    requestedBy: uuid("requested_by").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    justification: text("justification"),
    items: jsonb("items").$type<{ description: string; qty: number; unitCents: number }[]>().notNull().default([]),
    estimatedCents: bigint("estimated_cents", { mode: "number" }).notNull().default(0),
    currency: char("currency", { length: 3 }).notNull().default("USD"),
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    budgetId: uuid("budget_id").references(() => budgets.id, { onDelete: "set null" }),
    neededBy: date("needed_by"),
    poNumber: text("po_number"),
    /** draft | submitted | approved | rejected | ordered | received | canceled */
    status: text("status").notNull().default("draft"),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("purchases_org_status_idx").on(t.organizationId, t.status)],
);

export const travelRequests = pgTable(
  "travel_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    requestedBy: uuid("requested_by").notNull().references(() => users.id, { onDelete: "cascade" }),
    destination: text("destination").notNull(),
    purpose: text("purpose"),
    departAt: date("depart_at"),
    returnAt: date("return_at"),
    estimatedCents: bigint("estimated_cents", { mode: "number" }).notNull().default(0),
    currency: char("currency", { length: 3 }).notNull().default("USD"),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    /** draft | submitted | approved | rejected | canceled */
    status: text("status").notNull().default("draft"),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("travel_org_status_idx").on(t.organizationId, t.status)],
);

// ============================================================================
// D13 — People ops / HR lifecycle
// ============================================================================

export const jobOpenings = pgTable(
  "job_openings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
    location: text("location"),
    employmentType: text("employment_type"),
    openings: integer("openings").notNull().default(1),
    hiringManagerUserId: uuid("hiring_manager_user_id").references(() => users.id, { onDelete: "set null" }),
    description: text("description"),
    /** draft | open | closed */
    status: text("status").notNull().default("open"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [index("jobs_org_status_idx").on(t.organizationId, t.status)],
);

export const candidates = pgTable(
  "candidates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    openingId: uuid("opening_id").references(() => jobOpenings.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email"),
    source: text("source"),
    /** applied | screen | interview | offer | hired | rejected */
    stage: text("stage").notNull().default("applied"),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("candidates_org_stage_idx").on(t.organizationId, t.stage)],
);

export const candidateEvents = pgTable(
  "candidate_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id").notNull().references(() => candidates.id, { onDelete: "cascade" }),
    /** note | interview | offer | stage_change */
    kind: text("kind").notNull().default("note"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("candidate_events_candidate_idx").on(t.candidateId)],
);

export const journeys = pgTable(
  "journeys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    /** onboarding | offboarding */
    kind: text("kind").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    dueDate: date("due_date"),
    /** open | completed */
    status: text("status").notNull().default("open"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("journeys_org_kind_idx").on(t.organizationId, t.kind, t.status)],
);

export const journeyItems = pgTable(
  "journey_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    journeyId: uuid("journey_id").notNull().references(() => journeys.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** task | document | knowledge | access | asset | exit_interview */
    kind: text("kind").notNull().default("task"),
    assigneeUserId: uuid("assignee_user_id").references(() => users.id, { onDelete: "set null" }),
    done: boolean("done").notNull().default(false),
    doneAt: timestamp("done_at", { withTimezone: true }),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
  },
  (t) => [index("journey_items_journey_idx").on(t.journeyId)],
);

export const reviewCycles = pgTable(
  "review_cycles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    periodLabel: text("period_label").notNull(),
    selfDueAt: date("self_due_at"),
    managerDueAt: date("manager_due_at"),
    /** draft | active | closed */
    status: text("status").notNull().default("active"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("review_cycles_org_idx").on(t.organizationId, t.status)],
);

export const reviewEntries = pgTable(
  "review_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    cycleId: uuid("cycle_id").notNull().references(() => reviewCycles.id, { onDelete: "cascade" }),
    employeeUserId: uuid("employee_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    managerUserId: uuid("manager_user_id").references(() => users.id, { onDelete: "set null" }),
    selfAchievements: text("self_achievements"),
    selfChallenges: text("self_challenges"),
    selfGoals: text("self_goals"),
    managerFeedback: text("manager_feedback"),
    managerRating: integer("manager_rating"),
    outcome: text("outcome"),
    /** pending | self_done | manager_done | finalized */
    status: text("status").notNull().default("pending"),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("review_entries_cycle_idx").on(t.cycleId), index("review_entries_employee_idx").on(t.employeeUserId)],
);

export const courses = pgTable(
  "courses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: text("category"),
    required: boolean("required").notNull().default(false),
    durationMins: integer("duration_mins"),
    description: text("description"),
    /** draft | published */
    status: text("status").notNull().default("published"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("courses_org_idx").on(t.organizationId, t.status)],
);

export const courseEnrollments = pgTable(
  "course_enrollments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** assigned | in_progress | completed */
    status: text("status").notNull().default("assigned"),
    dueAt: date("due_at"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("enrollments_user_idx").on(t.userId), index("enrollments_course_idx").on(t.courseId)],
);

export const recognitions = pgTable(
  "recognitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    fromUserId: uuid("from_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    toUserId: uuid("to_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    message: text("message").notNull(),
    badge: text("badge").notNull().default("thanks"),
    visibility: text("visibility").notNull().default("company"), // private | team | department | company
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("recognitions_org_created_idx").on(t.organizationId, t.createdAt)],
);

export const jobChanges = pgTable(
  "job_changes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** promotion | transfer | compensation | title_change */
    kind: text("kind").notNull(),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    effectiveAt: date("effective_at"),
    note: text("note"),
    /** proposed | approved | applied | rejected */
    status: text("status").notNull().default("proposed"),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("job_changes_user_idx").on(t.userId)],
);

// ---------- shifts (HR ops) ----------

export const shiftTypes = pgTable(
  "shift_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startMinutes: integer("start_minutes").notNull(),
    endMinutes: integer("end_minutes").notNull(),
    graceMinutes: integer("grace_minutes").notNull().default(15),
    workingHours: numeric("working_hours", { precision: 4, scale: 2 }).notNull().default("8"),
    color: text("color"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("shift_types_org_name_key").on(t.organizationId, sql`lower(${t.name})`),
    index("shift_types_org_idx").on(t.organizationId),
  ],
);

export const shiftAssignments = pgTable(
  "shift_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeUserId: uuid("employee_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    shiftTypeId: uuid("shift_type_id")
      .notNull()
      .references(() => shiftTypes.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    /** { daysOfWeek: number[]; repeat: "weekly" } for range-assignments */
    recurrence: jsonb("recurrence").$type<{ repeat: "weekly"; daysOfWeek: number[] } | null>(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("shift_assignments_org_user_date_key").on(t.organizationId, t.employeeUserId, t.date),
    index("shift_assignments_org_date_idx").on(t.organizationId, t.date),
  ],
);

// ---------- attendance corrections ----------

export const attendanceCorrections = pgTable(
  "attendance_corrections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeUserId: uuid("employee_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recordDate: date("record_date").notNull(),
    type: attendanceCorrectionTypeEnum("type").notNull(),
    requestedInAt: timestamp("requested_in_at", { withTimezone: true }),
    requestedOutAt: timestamp("requested_out_at", { withTimezone: true }),
    reason: text("reason").notNull(),
    status: attendanceCorrectionStatusEnum("status").notNull().default("pending"),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedNote: text("decided_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("attendance_corrections_org_status_idx").on(t.organizationId, t.status),
    index("attendance_corrections_org_employee_idx").on(t.organizationId, t.employeeUserId),
  ],
);

// ---------- employee HR documents ----------

export const employeeDocuments = pgTable(
  "employee_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeUserId: uuid("employee_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    docType: text("doc_type").notNull().default("other"),
    title: text("title").notNull(),
    fileKey: text("file_key").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    expiresAt: date("expires_at"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("employee_documents_org_idx").on(t.organizationId),
    index("employee_documents_org_employee_idx").on(t.organizationId, t.employeeUserId),
  ],
);

// ---------- leave encashment ----------

export const leaveEncashments = pgTable(
  "leave_encashments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeUserId: uuid("employee_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    leaveTypeId: uuid("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id, { onDelete: "restrict" }),
    days: numeric("days", { precision: 5, scale: 1 }).notNull(),
    rate: numeric("rate", { precision: 12, scale: 2 }),
    amount: numeric("amount", { precision: 12, scale: 2 }),
    reason: text("reason"),
    status: leaveStatusEnum("status").notNull().default("pending"),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedNote: text("decided_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("leave_encashments_org_status_idx").on(t.organizationId, t.status),
    index("leave_encashments_org_employee_idx").on(t.organizationId, t.employeeUserId),
  ],
);

// ---------- salary advances (Phase 7, Frappe parity) ----------

export const salaryAdvances = pgTable(
  "salary_advances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeUserId: uuid("employee_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    reason: text("reason"),
    /** 'pending' | 'approved' | 'rejected' | 'recovered' */
    status: text("status").notNull().default("pending"),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("salary_advances_org_status_idx").on(t.organizationId, t.status),
    index("salary_advances_user_idx").on(t.employeeUserId),
  ],
);

// ---------- payroll (P4, native) ----------

export const salaryComponents = pgTable(
  "salary_components",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull().default("earning"), // earning | deduction
    amountType: text("amount_type").notNull().default("fixed"), // fixed | percent_of_basic
    defaultAmount: numeric("default_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    isTaxable: boolean("is_taxable").notNull().default(true),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("salary_components_org_name_type_key").on(t.organizationId, sql`lower(${t.name})`, t.type),
    index("salary_components_org_idx").on(t.organizationId),
  ],
);

export const salaryStructures = pgTable(
  "salary_structures",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeUserId: uuid("employee_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    base: numeric("base", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    effectiveFrom: date("effective_from").notNull().defaultNow(),
    status: text("status").notNull().default("draft"), // draft | active | superseded
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("salary_structures_org_idx").on(t.organizationId),
    index("salary_structures_org_status_idx").on(t.organizationId, t.status),
  ],
);

export const salaryStructureLines = pgTable(
  "salary_structure_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    structureId: uuid("structure_id")
      .notNull()
      .references(() => salaryStructures.id, { onDelete: "cascade" }),
    componentId: uuid("component_id")
      .notNull()
      .references(() => salaryComponents.id, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 14, scale: 2 }),
    percentOfBasic: numeric("percent_of_basic", { precision: 6, scale: 2 }),
  },
  (t) => [index("salary_structure_lines_structure_idx").on(t.structureId)],
);

export const payrollRuns = pgTable(
  "payroll_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    periodLabel: text("period_label").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    status: text("status").notNull().default("draft"), // draft | submitted | approved | paid
    currency: text("currency").notNull().default("USD"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    submittedBy: uuid("submitted_by").references(() => users.id, { onDelete: "set null" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    paidBy: uuid("paid_by").references(() => users.id, { onDelete: "set null" }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [
    index("payroll_runs_org_idx").on(t.organizationId),
    index("payroll_runs_org_status_idx").on(t.organizationId, t.status),
  ],
);

export interface PayslipLine {
  component: string;
  amount: number;
}

export const payslips = pgTable(
  "payslips",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => payrollRuns.id, { onDelete: "cascade" }),
    employeeUserId: uuid("employee_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    employeeCode: text("employee_code"),
    earnings: jsonb("earnings").$type<PayslipLine[]>().notNull().default([]),
    deductions: jsonb("deductions").$type<PayslipLine[]>().notNull().default([]),
    gross: numeric("gross", { precision: 14, scale: 2 }).notNull().default("0"),
    totalDeductions: numeric("total_deductions", { precision: 14, scale: 2 }).notNull().default("0"),
    net: numeric("net", { precision: 14, scale: 2 }).notNull().default("0"),
    currency: text("currency").notNull().default("USD"),
    locked: boolean("locked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payslips_run_employee_key").on(t.runId, t.employeeUserId),
    index("payslips_org_idx").on(t.organizationId),
    index("payslips_employee_idx").on(t.employeeUserId),
  ],
);

export const profileChangeRequests = pgTable(
  "profile_change_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    fieldKey: text("field_key").notNull(), // phone | emergency_contact | address | skills | photo
    currentValue: text("current_value"),
    requestedValue: text("requested_value").notNull(),
    /** pending | approved | rejected */
    status: text("status").notNull().default("pending"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("profile_changes_user_idx").on(t.userId, t.status)],
);

// ---------- Phase D: web push subscriptions + shared rate limiting ----------

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.organizationId, t.userId)],
);

export const rateLimitHits = pgTable(
  "rate_limit_hits",
  {
    /** 'org' | 'ip' | 'key' */
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    /** Fixed-window epoch-second start. */
    windowStart: bigint("window_start", { mode: "number" }).notNull(),
    count: integer("count").notNull().default(1),
  },
  (t) => [
    primaryKey({ columns: [t.scope, t.key, t.windowStart] }),
    index("rate_limit_hits_expiry_idx").on(t.windowStart),
  ],
);
