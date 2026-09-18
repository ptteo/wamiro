import { redirect } from "next/navigation";

import { loadAuthContext, readSessionToken, type AuthContext } from "./session";
import { can } from "@/modules/iam/engine";

/**
 * Server-component guard: redirects to /login when unauthenticated.
 *
 * G-05 note: page renders intentionally stay OUTSIDE `withTenantScope`.
 * RSC streaming means a scope entered here cannot wrap the page body's
 * queries (the AsyncLocalStorage context ends with this function), and
 * pinning a pool connection per render would starve the small pool. The
 * second RLS wall therefore applies to API mutations (route()) — where
 * writes concentrate — while page reads rely on the module-layer
 * organization_id discipline, now enforced by
 * src/tests/page-db-guard.test.ts: any page reading `db` directly must be
 * on a reviewed allowlist.
 */
export async function requireAuthPage(): Promise<AuthContext> {
  const token = await readSessionToken();
  if (!token) redirect("/login");
  try {
    return await loadAuthContext(token);
  } catch {
    redirect("/login");
  }
}

export { can };
