import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { pingDb } from "@/lib/session";

/** Read the product version from package.json at runtime (no bundler import). */
function appVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { version: string };
    return pkg.version;
  } catch {
    return "unknown";
  }
}

/**
 * Unauthenticated liveness/readiness probe for uptime monitoring + Caddy.
 * D11 §19: application + database component statuses.
 */
export const GET = route(
  async () => {
    const db = await pingDb();
    const body = {
      ok: db,
      version: appVersion(),
      components: {
        database: db ? ("healthy" as const) : ("unavailable" as const),
      },
    };
    return NextResponse.json(body, { status: db ? 200 : 503 });
  },
  { auth: false },
);
