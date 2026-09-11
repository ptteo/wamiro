import { type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { hrAnalytics, supportAnalytics } from "@/modules/analytics/reports";

/** Flatten one level of a report object into CSV rows (sections → columns). */
function toCsv(report: Record<string, unknown>): string {
  const lines: string[] = [];
  const esc = (v: unknown): string => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  for (const [key, value] of Object.entries(report)) {
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      if (typeof value[0] === "object" && value[0] !== null) {
        const cols = [...new Set(value.flatMap((r) => Object.keys(r as Record<string, unknown>)))];
        lines.push([`section:${key}`, ...cols].map(esc).join(","));
        for (const row of value as Record<string, unknown>[]) {
          lines.push([key, ...cols.map((c) => esc(row[c]))].join(","));
        }
      } else {
        lines.push([`section:${key}`, "value"].map(esc).join(","));
        for (const v of value) lines.push([key, esc(v)].join(","));
      }
    } else if (typeof value === "object" && value !== null) {
      const flat: string[] = [];
      const walk = (prefix: string, v: unknown) => {
        if (typeof v === "object" && v !== null && !Array.isArray(v)) {
          for (const [k, inner] of Object.entries(v as Record<string, unknown>)) {
            walk(`${prefix}.${k}`, inner);
          }
        } else if (Array.isArray(v)) {
          flat.push(`${prefix}=[${v.length} items]`);
        } else {
          flat.push(`${prefix}=${String(v)}`);
        }
      };
      walk(key, value);
      for (const f of flat) lines.push(`${key},${esc(f)}`);
    } else {
      lines.push([key, esc(value)].join(","));
    }
  }
  return lines.join("\n");
}

/**
 * Phase 8 — CSV exports for the analytics reports (data.export permission).
 * `?dataset=hr|support`.
 */
export const GET = route(
  async (req: NextRequest, { auth }) => {
    const dataset = req.nextUrl.searchParams.get("dataset") ?? "hr";
    let report: Record<string, unknown> | null;
    if (dataset === "support") {
      report = (await supportAnalytics(auth)) as unknown as Record<string, unknown> | null;
    } else if (dataset === "hr") {
      report = (await hrAnalytics(auth)) as unknown as Record<string, unknown> | null;
    } else {
      throw ApiError.badRequest("Unknown dataset (use hr or support)");
    }
    if (!report) throw ApiError.forbidden("Missing permission: analytics.view_company");
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(toCsv(report), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="wamiro-${dataset}-${stamp}.csv"`,
      },
    });
  },
  { permission: "analytics.view_company" },
);
