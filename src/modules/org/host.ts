/**
 * White-label host resolution (Phase D).
 *
 * A request arrives on one of three kinds of host:
 *   platform   app.wamiro.app / localhost:3000           → no tenant binding
 *   subdomain  <slug>.wamiro.app (env APP_URL host)      → org by slug
 *   custom     hr.acme.com (CNAME → platform)            → org by custom_domain
 *
 * The resolved org brands public pages (login, PWA manifest) and — in
 * middleware — custom domains are lazily self-verified the first time a
 * request actually arrives on them.
 */
import { eq, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { env, hostOnly } from "@/lib/env";
import { organizations } from "@/db/schema";

export type HostMode = "platform" | "subdomain" | "custom";

export interface ResolvedTenant {
  id: string;
  slug: string;
  name: string;
  mode: HostMode;
  /** Set when the host matched a custom_domain that was not yet verified. */
  needsVerification: boolean;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
}

/** Hostnames that are the product itself (never a tenant). */
export function platformHosts(): string[] {
  let main = "";
  try {
    main = hostOnly(new URL(env.APP_URL).host);
  } catch {
    main = hostOnly(env.APP_URL);
  }
  const extras = env.PLATFORM_HOSTS.map(hostOnly);
  return Array.from(new Set([main, ...extras])).filter(Boolean);
}

export function isPlatformHost(host: string): boolean {
  const h = hostOnly(host);
  return platformHosts().includes(h);
}

/** Subdomain labels that are product infrastructure, never tenant slugs. */
const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "mail",
  "status",
  "help",
  "support",
  "docs",
]);

/** Parse a Host header into mode + candidate subdomain (lower-cased). */
export function classifyHost(host: string): { mode: HostMode; subdomain: string | null } {
  const h = hostOnly(host);
  for (const p of platformHosts()) {
    if (h === p) return { mode: "platform", subdomain: null };
    if (h.endsWith(`.${p}`)) {
      const sub = h.slice(0, -(p.length + 1));
      // Only treat well-formed, non-reserved slugs as tenant subdomains.
      if (/^[a-z0-9][a-z0-9-]{1,62}$/.test(sub) && !RESERVED_SUBDOMAINS.has(sub)) {
        return { mode: "subdomain", subdomain: sub };
      }
      return { mode: "platform", subdomain: null };
    }
  }
  return { mode: "custom", subdomain: null };
}

/**
 * Resolve a Host header to a tenant org, or null for platform hosts and
 * hosts that belong to no tenant. Never throws for unknown hosts.
 */
export async function resolveOrgForHost(host: string): Promise<ResolvedTenant | null> {
  const { mode, subdomain } = classifyHost(host);
  if (mode === "platform") return null;

  const h = hostOnly(host);
  const where =
    mode === "subdomain" && subdomain
      ? eq(organizations.slug, subdomain)
      : eq(sql`lower(${organizations.customDomain})`, h);

  const [row] = await db
    .select({
      id: organizations.id,
      slug: organizations.slug,
      name: organizations.name,
      customDomain: organizations.customDomain,
      customDomainVerified: organizations.customDomainVerified,
      primaryColor: organizations.primaryColor,
      secondaryColor: organizations.secondaryColor,
      logoUrl: organizations.logoUrl,
    })
    .from(organizations)
    .where(where)
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    mode,
    needsVerification: mode === "custom" && !row.customDomainVerified,
    primaryColor: row.primaryColor,
    secondaryColor: row.secondaryColor,
    logoUrl: row.logoUrl,
  };
}

/** Short-lived per-host cache so middleware/RSC don't re-query every asset. */
const cache = new Map<string, { at: number; value: ResolvedTenant | null }>();
const TTL_MS = 10_000;
const MAX_ENTRIES = 2_000;

export async function resolveOrgForHostCached(host: string): Promise<ResolvedTenant | null> {
  const key = hostOnly(host);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  if (cache.size > MAX_ENTRIES) cache.clear();
  const value = await resolveOrgForHost(host);
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Lazily verify a custom domain the moment traffic actually arrives on it. */
export async function verifyCustomDomain(orgId: string): Promise<void> {
  await db
    .update(organizations)
    .set({ customDomainVerified: true, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));
}

/** Validate a proposed custom domain (hostname shape, no scheme/path). */
export function isValidCustomDomain(input: string): boolean {
  const d = input.trim().toLowerCase();
  if (d.length < 4 || d.length > 253) return false;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)) return false;
  if (d.startsWith("www.")) return false; // forbid confusing bare-www hosts
  return !platformHosts().some((p) => d === p || d.endsWith(`.${p}`));
}

/** Custom domain is unique among tenants (platform subdomains excluded above). */
export async function customDomainTaken(domain: string, exceptOrgId?: string): Promise<boolean> {
  const rows = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(or(eq(sql`lower(${organizations.customDomain})`, domain)));
  return rows.some((r) => r.id !== exceptOrgId);
}

export { or };