import { AsyncLocalStorage } from "node:async_hooks";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";
import { env } from "./env";

declare global {
  // ponytail: dev hot-reload would otherwise open a new pool each change
  var __wamiroPool: Pool | undefined;
}

function createPool(): Pool {
  const url = env.DATABASE_URL;
  const needsSsl = /[?&]sslmode=require/.test(url);
  // Strip sslmode from the URL: newer pg treats `require` as verify-full and
  // would override our explicit ssl option (RDS CA isn't in Node's trust
  // store → SELF_SIGNED_CERT_IN_CHAIN). TLS stays on; only chain verification
  // is relaxed. Swap rejectUnauthorized for the RDS CA bundle for verify-full.
  const cleanUrl = url.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, "");
  const pool = new Pool({
    connectionString: cleanUrl,
    max: 10, // Lightsail-sized: small pool; RDS connection limit is not the bottleneck at this scale
    idleTimeoutMillis: 30_000,
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  return pool;
}

export const pool = (globalThis.__wamiroPool ??= createPool());

export type Db = NodePgDatabase<typeof schema>;

const baseDb: Db = drizzle(pool, { schema });

/**
 * Phase 4 — per-request tenant scope (RLS defense-in-depth).
 *
 * The exported `db` is a proxy that, when a request is running inside
 * `withTenantScope`, resolves to a drizzle instance pinned to one pooled
 * connection whose `app.org_id` session GUC equals the tenant's id. Postgres
 * row-level security then hides any row whose organization_id does not match
 * — the second wall behind the module-level query discipline.
 *
 * Outside a scope (jobs worker, platform console, seeds, tests, session
 * loading, public routes) the proxy falls back to `baseDb` with no GUC, which
 * the RLS policies treat as the trusted platform/operator context.
 */
const tenantStore = new AsyncLocalStorage<Db>();

function createDbProxy(): Db {
  const handler: ProxyHandler<Db> = {
    get(_target, prop, _receiver) {
      const scoped = tenantStore.getStore();
      const source = scoped ?? baseDb;
      const value = Reflect.get(source, prop, source);
      return typeof value === "function" ? value.bind(source) : value;
    },
    has(_target, prop) {
      return prop in (tenantStore.getStore() ?? baseDb);
    },
    getOwnPropertyDescriptor(_target, prop) {
      return Reflect.getOwnPropertyDescriptor(tenantStore.getStore() ?? baseDb, prop);
    },
    ownKeys() {
      return Reflect.ownKeys(tenantStore.getStore() ?? baseDb);
    },
    getPrototypeOf() {
      return Reflect.getPrototypeOf(baseDb);
    },
  };
  return new Proxy(baseDb, handler);
}

export const db: Db = createDbProxy();

/**
 * Run `fn` with Postgres row-level security scoped to one tenant.
 *
 * Pins a connection from the pool, sets `app.org_id`, runs `fn` with a
 * client-bound drizzle instance, then resets the GUC and returns the
 * connection. On any error the connection is destroyed (never reused) so a
 * stale GUC or aborted transaction can never leak into another tenant's
 * request. Nested `db.transaction(...)` calls inside `fn` behave normally
 * (the GUC is session-level, so it survives inner BEGIN/COMMIT).
 */
export async function withTenantScope<T>(orgId: string, fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let released = false;
  const release = (destroy: boolean) => {
    if (released) return;
    released = true;
    if (destroy) client.release(true);
    else client.release();
  };
  try {
    // SET does not accept parameters — set_config() does, and org ids are
    // bound as values, never interpolated.
    await client.query("SELECT set_config('app.org_id', $1, false)", [orgId]);
    const scoped: Db = drizzle(client, { schema });
    const result = await tenantStore.run(scoped, fn);
    try {
      await client.query("SELECT set_config('app.org_id', '', false)");
    } catch {
      // connection unusable — discard it rather than risk a stale GUC
      release(true);
      return result;
    }
    release(false);
    return result;
  } catch (e) {
    release(true);
    throw e;
  }
}

/**
 * Assert exactly-one-row results from INSERT..RETURNING / LIMIT-1 selects.
 * Throws loudly instead of leaking `undefined` into the domain layer.
 */
export function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error("expected a row, got none");
  return row;
}
