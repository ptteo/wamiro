/**
 * White-label custom domain management (Phase D).
 *
 * A tenant points `{their-domain}` at the platform host with a CNAME, then
 * registers the domain here. Verification is lazy and self-certifying: the
 * domain flips to `verified` the first time a request actually arrives on it
 * (see host.ts `verifyCustomDomain`), which only happens once the DNS record
 * is live — no third-party DNS API needed.
 */
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { organizations } from "@/db/schema";
import { customDomainTaken, isValidCustomDomain, platformHosts } from "./host";

function cnameTarget(): string {
  return platformHosts()[0] ?? new URL(env.APP_URL).host;
}

export interface DomainState {
  customDomain: string | null;
  verified: boolean;
  cnameTarget: string;
}

/** Convenience: full DomainState for the route + UI. */
export async function getDomainState(ctx: AuthContext): Promise<DomainState> {
  const [org] = await db
    .select({
      customDomain: organizations.customDomain,
      customDomainVerified: organizations.customDomainVerified,
    })
    .from(organizations)
    .where(eq(organizations.id, ctx.user.organizationId))
    .limit(1);
  return {
    customDomain: org?.customDomain ?? null,
    verified: org?.customDomainVerified ?? false,
    cnameTarget: cnameTarget(),
  };
}

export async function setCustomDomain(
  ctx: AuthContext,
  raw: string,
): Promise<DomainState> {
  const domain = raw.trim().toLowerCase();
  if (!isValidCustomDomain(domain)) {
    throw ApiError.badRequest(
      "Enter a bare domain such as portal.acme.com (letters, digits, hyphens and dots only).",
    );
  }
  if (await customDomainTaken(domain, ctx.user.organizationId)) {
    throw ApiError.conflict("That domain is already claimed by another workspace");
  }

  await db
    .update(organizations)
    .set({ customDomain: domain, customDomainVerified: false, updatedAt: new Date() })
    .where(eq(organizations.id, ctx.user.organizationId));

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "CUSTOM_DOMAIN_SET",
    entityType: "organization",
    entityId: ctx.user.organizationId,
    newValue: { customDomain: domain },
  });

  return { customDomain: domain, verified: false, cnameTarget: cnameTarget() };
}

export async function clearCustomDomain(ctx: AuthContext): Promise<DomainState> {
  await db
    .update(organizations)
    .set({ customDomain: null, customDomainVerified: false, updatedAt: new Date() })
    .where(eq(organizations.id, ctx.user.organizationId));

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "CUSTOM_DOMAIN_CLEARED",
    entityType: "organization",
    entityId: ctx.user.organizationId,
  });

  return { customDomain: null, verified: false, cnameTarget: cnameTarget() };
}