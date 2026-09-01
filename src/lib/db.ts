import { drizzle } from "drizzle-orm/node-postgres";
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
export const db = drizzle(pool, { schema });

export type Db = typeof db;

/**
 * Assert exactly-one-row results from INSERT..RETURNING / LIMIT-1 selects.
 * Throws loudly instead of leaking `undefined` into the domain layer.
 */
export function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error("expected a row, got none");
  return row;
}
