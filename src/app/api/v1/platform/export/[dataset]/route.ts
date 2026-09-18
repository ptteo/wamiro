import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditOpsExport } from "@/modules/platform/entitlements";

/**
 * Phase F fold-in #5 — SOC-2-style ops export: platform datasets (billing
 * ledger, usage rollups, health scores, alert instances) as CSV. A REASON is
 * mandatory and is written to the platform audit with the dataset + range +
 * requesting operator — no silent exfiltration path.
 */

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  // neutralize formula injection + escape quotes/commas/newlines
  const safe = s.startsWith("=") || s.startsWith("+") || s.startsWith("-") || s.startsWith("@") ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

const DATASETS: Record<string, (from: string, to: string) => Promise<{ headers: string[]; rows: unknown[][] }>> = {
  invoices: async (from, to) => ({
    headers: ["number", "org_name", "org_slug", "amount_cents", "currency", "status", "source", "issued_at", "paid_at"],
    rows: (
      (await db.execute(sql`
        SELECT number, org_name, org_slug, amount_cents, currency, status, source, issued_at, paid_at
        FROM platform.billing_invoices
        WHERE issued_at >= ${from}::timestamptz AND issued_at <= ${to}::timestamptz
        ORDER BY issued_at LIMIT 10000
      `)).rows as unknown as unknown[][]
    ),
  }),
  usage: async (from, to) => ({
    headers: ["org_name", "org_slug", "day", "plan", "seats_active", "active_users", "actions", "logins", "mutations", "storage_bytes"],
    rows: (
      (await db.execute(sql`
        SELECT org_name, org_slug, day, plan, seats_active, active_users, actions, logins, mutations, storage_bytes
        FROM platform.tenant_usage_daily
        WHERE day >= ${from}::date AND day <= ${to}::date
        ORDER BY day, org_slug LIMIT 20000
      `)).rows as unknown as unknown[][]
    ),
  }),
  health: async (from, to) => ({
    headers: ["org_name", "day", "score", "grade", "factors"],
    rows: (
      (await db.execute(sql`
        SELECT org_name, day, score, grade, factors::text
        FROM platform.tenant_health_scores
        WHERE day >= ${from}::date AND day <= ${to}::date
        ORDER BY day, org_name LIMIT 20000
      `)).rows as unknown as unknown[][]
    ),
  }),
  alerts: async (from, to) => ({
    headers: ["rule", "org_name", "window_start", "state", "fired_at", "resolved_at", "payload"],
    rows: (
      (await db.execute(sql`
        SELECT r.name AS rule, i.org_name, i.window_start, i.state, i.fired_at, i.resolved_at, i.payload::text
        FROM platform.alert_instances i
        JOIN platform.alert_rules r ON r.id = i.rule_id
        WHERE i.fired_at >= ${from}::timestamptz AND i.fired_at <= ${to}::timestamptz
        ORDER BY i.fired_at DESC LIMIT 10000
      `)).rows as unknown as unknown[][]
    ),
  }),
  contracts: async (from, to) => ({
    headers: ["org_name", "org_slug", "start_date", "end_date", "annual_value_cents", "currency", "po_number", "auto_renew", "payment_method"],
    rows: (
      (await db.execute(sql`
        SELECT org_name, org_slug, start_date, end_date, annual_value_cents, currency, po_number, auto_renew, payment_method
        FROM platform.contracts
        WHERE created_at >= ${from}::timestamptz AND created_at <= ${to}::timestamptz
        ORDER BY created_at LIMIT 10000
      `)).rows as unknown as unknown[][]
    ),
  }),
};

export const GET = route(
  async (req: NextRequest, { auth, params }) => {
    const key = params["dataset"] ?? "";
    const loader = DATASETS[key];
    if (!loader) throw ApiError.badRequest(`Unknown dataset. One of: ${Object.keys(DATASETS).join(", ")}`);
    const sp = req.nextUrl.searchParams;
    const from = sp.get("from") ?? new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
    const to = sp.get("to") ?? new Date().toISOString().slice(0, 10);
    // fold-in #5: the reason prompt is mandatory + audited (throws < 10 chars)
    await auditOpsExport(auth, { dataset: key, from, to, reason: sp.get("reason") ?? "" });

    const { headers, rows } = await loader(from, to);
    const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="wamiro-platform-${key}-${from}-to-${to}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  },
  { permission: "platform.admin" },
);
