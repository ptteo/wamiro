import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { requirePlatform } from "@/modules/platform/console";
import type { AuthContext } from "@/lib/session";

/**
 * Phase C fold-in #8 — global tenant search (⌘K): tenant name, slug, admin
 * email, invoice number — from anywhere in the panel. Platform-only read.
 */
export const GET = route(
  async (req, { auth }) => {
    requirePlatform(auth as AuthContext);
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
    if (q.length < 2) return NextResponse.json({ results: [] });

    const like = `%${q.toLowerCase()}%`;
    const res = await db.execute(sql`
      SELECT 'tenant' AS type, o.id::text AS id, o.name AS title, o.slug AS subtitle
      FROM organizations o
      WHERE o.slug <> '__platform'
        AND (lower(o.name) LIKE ${like} OR lower(o.slug) LIKE ${like})
      LIMIT 5
      UNION ALL
      SELECT 'admin' AS type, u.id::text AS id, u.name AS title,
             u.email || ' · ' || o.name AS subtitle
      FROM users u
      JOIN organizations o ON o.id = u.organization_id
      WHERE o.slug <> '__platform' AND lower(u.email) LIKE ${like}
      LIMIT 5
      UNION ALL
      SELECT 'invoice' AS type, i.org_id::text AS id, i.number AS title,
             i.org_name || ' · ' || i.org_slug AS subtitle
      FROM platform.billing_invoices i
      WHERE lower(i.number) LIKE ${like}
      LIMIT 5
    `);
    return NextResponse.json({ results: res.rows });
  },
  { permission: "platform.admin" },
);
