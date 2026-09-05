/**
 * SCIM 2.0 provisioning (Phase C — enterprise trust). Lets an identity
 * provider (Okta, Entra ID, Google…) create, update, deactivate and group
 * employees directly.
 *
 *   Users  → `users` + `employees` + membership + default role
 *   Groups → `teams` (+ `team_members`)
 *
 * Authentication is a per-org bearer token (sha256-hashed at rest), the same
 * token an IdP stores in its SCIM connector. Deactivation is a soft suspend
 * (data is retained and audited), matching how the rest of the product treats
 * suspended identities.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { db, first } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import { hashPassword } from "@/lib/password";
import {
  employees,
  organizationMemberships,
  organizations,
  roles,
  teamMembers,
  teams,
  userRoles,
  users,
} from "@/db/schema";

const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export function hashScimToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Resolve the org for a SCIM bearer token (constant-ish time compare). */
export async function orgForToken(token: string): Promise<{ orgId: string } | null> {
  if (!token) return null;
  const want = Buffer.from(hashScimToken(token), "hex");
  const rows = await db
    .select({ id: organizations.id, scimEnabled: organizations.scimEnabled, scimTokenHash: organizations.scimTokenHash })
    .from(organizations)
    .where(eq(organizations.scimEnabled, true));
  for (const r of rows) {
    if (!r.scimTokenHash) continue;
    const got = Buffer.from(r.scimTokenHash, "hex");
    if (got.length === want.length && timingSafeEqual(got, want)) return { orgId: r.id };
  }
  return null;
}

export async function newScimToken(orgId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db
    .update(organizations)
    .set({ scimEnabled: true, scimTokenHash: hashScimToken(token), updatedAt: new Date() })
    .where(eq(organizations.id, orgId));
  return token;
}

export async function disableScim(orgId: string): Promise<void> {
  await db
    .update(organizations)
    .set({ scimEnabled: false, scimTokenHash: null, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));
}

// ---------------------------------------------------------------------------
// SCIM shapes
// ---------------------------------------------------------------------------

export interface ScimError {
  schemas: string[];
  detail: string;
  status: number;
}

export function scimError(status: number, detail: string): ScimError {
  return { schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], detail, status };
}

function userNameFromEmail(email: string): { givenName: string; familyName: string } {
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  return { givenName: parts[0] ?? local, familyName: parts.slice(1).join(" ") || "" };
}

async function scimUserFor(orgId: string, userRow: typeof users.$inferSelect) {
  const [employee] = await db
    .select({ jobTitle: employees.jobTitle, managerUserId: employees.managerUserId })
    .from(employees)
    .where(and(eq(employees.organizationId, orgId), eq(employees.userId, userRow.id)))
    .limit(1);
  return {
    schemas: [USER_SCHEMA],
    id: userRow.id,
    externalId: userRow.id,
    userName: userRow.email,
    name: { formatted: userRow.name, givenName: userRow.name.split(/\s+/)[0], familyName: userRow.name.split(/\s+/).slice(1).join(" ") },
    emails: [{ value: userRow.email, type: "work", primary: true }],
    active: userRow.status === "active",
    title: employee?.jobTitle ?? null,
    meta: {
      resourceType: "User",
      created: userRow.createdAt.toISOString(),
      lastModified: userRow.updatedAt?.toISOString() ?? userRow.createdAt.toISOString(),
    },
  };
}

async function defaultRoleId(orgId: string, roleKey: string): Promise<string> {
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.organizationId, orgId), eq(roles.key, roleKey)))
    .limit(1);
  return role?.id ?? "";
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function listUsers(orgId: string, filter: string | null) {
  let rows = await db.select().from(users).where(eq(users.organizationId, orgId));
  // Support the two filters Okta/Entra actually send:
  //   userName eq "x"    active eq true/false
  if (filter) {
    const m = /userName\s+eq\s+"([^"]+)"/i.exec(filter);
    if (m) rows = rows.filter((r) => r.email.toLowerCase() === m[1]!.toLowerCase());
    const a = /active\s+eq\s+(true|false)/i.exec(filter);
    if (a) rows = rows.filter((r) => (r.status === "active") === (a[1]!.toLowerCase() === "true"));
  }
  return Promise.all(rows.map((r) => scimUserFor(orgId, r)));
}

export async function getUser(orgId: string, userId: string) {
  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.organizationId, orgId)))
    .limit(1);
  if (!row) throw ApiError.notFound();
  return scimUserFor(orgId, row);
}

export async function createUser(orgId: string, body: Record<string, unknown>) {
  const email = String((body.userName ?? "")).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw ApiError.badRequest("userName must be a valid email");
  const name = String((body.name as Record<string, unknown> | undefined)?.formatted ?? body.displayName ?? email.split("@")[0]);
  const active = (body.active as boolean | undefined) ?? true;

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) throw ApiError.conflict(`User with userName ${email} already exists`);

  const [roleId] = [await defaultRoleId(orgId, "employee")];
  const passwordHash = await hashPassword(randomBytes(18).toString("base64url"));
  const user = first(
    await db
      .insert(users)
      .values({ organizationId: orgId, email, name: name.slice(0, 120), passwordHash, status: active ? "active" : "suspended" })
      .returning(),
  );
  if (!user) throw ApiError.notFound();
  await db.insert(organizationMemberships).values({ userId: user.id, organizationId: orgId }).onConflictDoNothing();
  await db
    .insert(employees)
    .values({ organizationId: orgId, userId: user.id, jobTitle: "Provisioned via SCIM" })
    .onConflictDoNothing();
  if (roleId) await db.insert(userRoles).values({ userId: user.id, roleId }).onConflictDoNothing();

  await audit({
    organizationId: orgId,
    actorUserId: null,
    action: "SCIM_USER_CREATED",
    entityType: "user",
    entityId: user.id,
    newValue: { email, active },
  });
  return scimUserFor(orgId, user);
}

export async function patchUser(orgId: string, userId: string, body: Record<string, unknown>) {
  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.organizationId, orgId)))
    .limit(1);
  if (!row) throw ApiError.notFound();
  const ops = (body.Operations ?? []) as { op?: string; path?: string; value?: unknown }[];
  let email = row.email;
  let name = row.name;
  let active: boolean | null = null;

  for (const op of ops) {
    const opName = String(op.op ?? "").toLowerCase();
    const path = op.path ? String(op.path).toLowerCase() : "";
    if (opName === "replace" && path === "username") email = String(op.value).trim().toLowerCase();
    if (opName === "replace" && path === "name.formatted") name = String(op.value).slice(0, 120);
    if (opName === "replace" && path === "active") active = Boolean(op.value);
    if (opName === "replace" && !path) {
      const v = (op.value ?? {}) as Record<string, unknown>;
      if (v.userName) email = String(v.userName).trim().toLowerCase();
      const nm = v.name as Record<string, unknown> | undefined;
      if (nm?.formatted) name = String(nm.formatted).slice(0, 120);
      if (typeof v.active === "boolean") active = v.active;
    }
  }
  const nextStatus = active === null ? row.status : active ? "active" : "suspended";
  await db
    .update(users)
    .set({ email, name, status: nextStatus })
    .where(and(eq(users.id, userId), eq(users.organizationId, orgId)));
  if (active !== null) {
    await db
      .update(organizationMemberships)
      .set({ status: active ? "active" : "suspended" })
      .where(and(eq(organizationMemberships.userId, userId), eq(organizationMemberships.organizationId, orgId)));
  }
  await audit({
    organizationId: orgId,
    actorUserId: null,
    action: "SCIM_USER_UPDATED",
    entityType: "user",
    entityId: userId,
    newValue: { email, active: nextStatus },
  });
  return getUser(orgId, userId);
}

/** SCIM delete = deactivate (soft). Identity data is retained for audit. */
export async function deactivateUser(orgId: string, userId: string): Promise<void> {
  const [row] = await db
    .update(users)
    .set({ status: "suspended" })
    .where(and(eq(users.id, userId), eq(users.organizationId, orgId)))
    .returning({ id: users.id, email: users.email });
  if (!row) throw ApiError.notFound();
  await db
    .update(organizationMemberships)
    .set({ status: "suspended" })
    .where(and(eq(organizationMemberships.userId, userId), eq(organizationMemberships.organizationId, orgId)));
  await audit({
    organizationId: orgId,
    actorUserId: null,
    action: "SCIM_USER_DEACTIVATED",
    entityType: "user",
    entityId: userId,
    newValue: { email: row.email },
  });
}

// ---------------------------------------------------------------------------
// Groups → teams
// ---------------------------------------------------------------------------

async function scimGroupFor(orgId: string, teamId: string) {
  const [row] = await db
    .select({
      id: teams.id,
      name: teams.name,
      createdAt: teams.createdAt,
      members: sql<string[]>`COALESCE((SELECT array_agg(tm.user_id) FROM team_members tm WHERE tm.team_id = ${teams.id}), '{}')`,
    })
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.organizationId, orgId)))
    .limit(1);
  if (!row) throw ApiError.notFound();
  return {
    schemas: [GROUP_SCHEMA],
    id: row.id,
    externalId: row.id,
    displayName: row.name,
    members: row.members.map((userId) => ({ value: userId, $ref: `/Users/${userId}` })),
    meta: { resourceType: "Group", created: row.createdAt.toISOString(), lastModified: row.createdAt.toISOString() },
  };
}

export async function listGroups(orgId: string) {
  const rows = await db.select({ id: teams.id }).from(teams).where(eq(teams.organizationId, orgId));
  return Promise.all(rows.map((r) => scimGroupFor(orgId, r.id)));
}

export async function createGroup(orgId: string, body: Record<string, unknown>) {
  const name = String(body.displayName ?? "").trim().slice(0, 120);
  if (!name) throw ApiError.badRequest("displayName is required");
  const [row] = await db
    .insert(teams)
    .values({ organizationId: orgId, name })
    .returning({ id: teams.id });
  if (!row) throw ApiError.notFound();
  await audit({
    organizationId: orgId,
    actorUserId: null,
    action: "SCIM_GROUP_CREATED",
    entityType: "team",
    entityId: row.id,
    newValue: { name },
  });
  return scimGroupFor(orgId, row.id);
}

export async function patchGroup(orgId: string, groupId: string, body: Record<string, unknown>) {
  const [group] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.id, groupId), eq(teams.organizationId, orgId)))
    .limit(1);
  if (!group) throw ApiError.notFound();
  const ops = (body.Operations ?? []) as { op?: string; value?: { value?: string }[] }[];
  for (const op of ops) {
    const opName = String(op.op ?? "").toLowerCase();
    const vals = Array.isArray(op.value) ? op.value.filter((v) => v && typeof v.value === "string") : [];
    const userIds = vals.map((v) => v.value!);
    if (userIds.length === 0) continue;
    const valid = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.organizationId, orgId), inArray(users.id, userIds)));
    const validIds = valid.map((r) => r.id);
    if (opName === "add") {
      await db.insert(teamMembers).values(validIds.map((uid) => ({ teamId: groupId, userId: uid }))).onConflictDoNothing();
    } else if (opName === "remove") {
      await db.delete(teamMembers).where(and(eq(teamMembers.teamId, groupId), inArray(teamMembers.userId, validIds)));
    }
  }
  await audit({
    organizationId: orgId,
    actorUserId: null,
    action: "SCIM_GROUP_UPDATED",
    entityType: "team",
    entityId: groupId,
  });
  return scimGroupFor(orgId, groupId);
}

export async function deleteGroup(orgId: string, groupId: string): Promise<void> {
  const [row] = await db
    .delete(teams)
    .where(and(eq(teams.id, groupId), eq(teams.organizationId, orgId)))
    .returning({ id: teams.id, name: teams.name });
  if (!row) throw ApiError.notFound();
  await audit({
    organizationId: orgId,
    actorUserId: null,
    action: "SCIM_GROUP_DELETED",
    entityType: "team",
    entityId: groupId,
    newValue: { name: row.name },
  });
}