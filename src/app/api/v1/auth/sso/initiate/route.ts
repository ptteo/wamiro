import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { db } from "@/lib/db";
import { organizations } from "@/db/schema";
import { beginLogin } from "@/modules/sso/service";

/**
 * GET /api/v1/auth/sso/initiate?org=<slug>&redirect=/home
 * Resolves the tenant by slug, starts the OIDC flow, and 302s to the IdP.
 * Public (auth: false) — this IS the login entry point.
 */
export const GET = route(
  async (req) => {
    const slug = req.nextUrl.searchParams.get("org")?.trim();
    if (!slug) throw ApiError.badRequest("org (slug) is required");
    const redirectTo = req.nextUrl.searchParams.get("redirect")?.trim() || "/home";

    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);
    if (!org) throw ApiError.notFound("Unknown organization");

    const { redirectUrl } = await beginLogin(org.id, redirectTo);
    return NextResponse.redirect(redirectUrl);
  },
  { auth: false },
);