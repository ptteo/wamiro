/**
 * G-05 — page-layer DB guard (CI wall).
 *
 * The RLS second wall (`withTenantScope`) is applied in the API `route()`
 * wrapper, where all writes concentrate. Page renders stream after the
 * loader returns, so a scope there cannot wrap page-body queries (and
 * pinning a pool connection per render would starve it). Page reads
 * therefore rely on the module-layer `organization_id` discipline.
 *
 * This test makes that discipline *observable*: any page under (app) that
 * imports the raw `db` client must appear on the reviewed allowlist below.
 * New direct-DB pages fail CI until they are either (a) org-scoped and
 * allowlisted with a one-line justification, or (b) moved into a module
 * service that scopes by ctx.user.organizationId — the preferred shape.
 */
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

/** Reviewed direct-DB pages: path → why the raw read is safe. */
const ALLOWLIST: Record<string, string> = {
  // Mobile shell: impersonation banner lookup is token-scoped, not org-scoped.
  "src/app/(app)/layout.tsx": "impersonation banner by return-token hash (pre-auth context)",
  // Both queries filter by ids derived from already-org-scoped lists.
  "src/app/(app)/requests/page.tsx": "reviewer/type names by ids from org-scoped rows",
  // Admin audit page: actor picker filtered by organizationId equality.
  "src/app/(app)/admin/audit/page.tsx": "actor dropdown filtered by organizationId",
  // Self-profile read: `eq(users.id, ctx.user.id)` — own row only.
  "src/app/(app)/settings/security/page.tsx": "own user row by ctx.user.id",
  // Custom-fields read: `eq(employees.organizationId, ctx.user.organizationId)`.
  "src/app/(app)/people/[id]/page.tsx": "employee customFields filtered by organizationId",
};

const APP_DIR = join(process.cwd(), "src", "app", "(app)");
const APP_DIR_PREFIX = APP_DIR.replaceAll("\\", "/");

/** Normalize to forward-slash repo-relative key: src/app/(app)/…. */
function relKey(absolutePath: string): string {
  return absolutePath.replaceAll("\\", "/").replace(`${APP_DIR_PREFIX}/`, "src/app/(app)/");
}

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else if (e.name === "page.tsx" || e.name === "layout.tsx") out.push(full);
  }
  return out;
}

test("every (app) page importing db is allowlisted with a justification", async () => {
  const pages = await walk(APP_DIR);
  const offenders: string[] = [];
  for (const page of pages) {
    const src = await readFile(page, "utf8");
    // Only raw-client imports — services import db internally but are
    // centrally reviewed by the isolation suite.
    if (!/from ["']@\/lib\/db["']/.test(src)) continue;
    const rel = relKey(page);
    if (!ALLOWLIST[rel]) offenders.push(rel);
  }
  assert.deepEqual(
    offenders,
    [],
    `Pages reading db directly without an allowlist entry (fix by moving the\n` +
      `query into a module service scoped by ctx.user.organizationId, or add\n` +
      `an entry with a justification if the read is provably org-safe):\n  ${offenders.join("\n  ")}`,
  );
});

test("allowlist entries point at real files (no stale entries)", async () => {
  const pages = new Set((await walk(APP_DIR)).map(relKey));
  const stale = Object.keys(ALLOWLIST).filter((k) => !pages.has(k));
  assert.deepEqual(stale, [], `Stale allowlist entries (files no longer exist): ${stale.join(", ")}`);
});
