/**
 * Pure RBAC engine. No DB, no Next — trivially unit-testable.
 *
 * Precedence (blueprint §15):
 *   explicit DENY  >  direct ALLOW override  >  role grants
 * An unexpired deny always wins. Expired overrides are ignored entirely.
 */
import { ALL_PERMISSIONS, SCOPE_RANK, type PermissionScope } from "./catalog";

export interface Grant {
  permission: string;
  scope: PermissionScope;
}

export interface Override extends Grant {
  effect: "allow" | "deny";
  expiresAt: Date | null;
}

export interface EffectiveAccess {
  /** permission → widest live scope granted (role or allow-override) */
  allowed: Map<string, PermissionScope>;
  /** permissions under a live explicit deny */
  denied: Set<string>;
}

function live(o: Override, now: Date): boolean {
  return o.expiresAt === null || o.expiresAt > now;
}

export function computeEffectiveAccess(
  roleGrants: readonly Grant[],
  overrides: readonly Override[],
  now: Date = new Date(),
): EffectiveAccess {
  const allowed = new Map<string, PermissionScope>();
  for (const g of roleGrants) {
    if (!ALL_PERMISSIONS.includes(g.permission)) continue; // unknown keys never grant
    const current = allowed.get(g.permission);
    if (!current || SCOPE_RANK[g.scope] > SCOPE_RANK[current]) {
      allowed.set(g.permission, g.scope);
    }
  }
  for (const o of overrides) {
    if (!live(o, now)) continue;
    if (o.effect === "deny") {
      allowed.delete(o.permission);
      continue;
    }
    if (!ALL_PERMISSIONS.includes(o.permission)) continue;
    const current = allowed.get(o.permission);
    if (!current || SCOPE_RANK[o.scope] > SCOPE_RANK[current]) {
      allowed.set(o.permission, o.scope);
    }
  }
  // second pass so a later-in-list deny beats an earlier allow-override
  const denied = new Set<string>();
  for (const o of overrides) {
    if (o.effect === "deny" && live(o, now)) denied.add(o.permission);
  }
  return { allowed, denied };
}

export function can(access: EffectiveAccess, permission: string): boolean {
  // R3 hardening: keys outside the catalog can never be granted, even by an
  // override — the engine, not callers, is the final authority on what exists.
  if (!ALL_PERMISSIONS.includes(permission)) return false;
  return access.allowed.has(permission) && !access.denied.has(permission);
}

/** Widest scope held for a family like attendance.view_* (used for data filters). */
export function widestScope(
  access: EffectiveAccess,
  prefix: string,
): PermissionScope | null {
  let best: PermissionScope | null = null;
  for (const [permission, scope] of access.allowed) {
    if (access.denied.has(permission)) continue;
    if (permission.startsWith(prefix) && (!best || SCOPE_RANK[scope] > SCOPE_RANK[best])) {
      best = scope;
    }
  }
  return best;
}
