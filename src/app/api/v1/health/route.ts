import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import { readFileSync } from "node:fs";

import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { pingDb } from "@/lib/session";
import { jobHealth } from "@/modules/platform/jobs";

/** Read the product version from package.json at runtime (no bundler import). */
function appVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { version: string };
    return pkg.version;
  } catch {
    return "unknown";
  }
}

/** Storage component: the tenant data dir must exist (or be creatable) + writable. */
async function storageHealth(): Promise<"healthy" | "unavailable"> {
  const root = resolve(process.env.WAMIRO_DATA_DIR ?? join(process.cwd(), "data"));
  try {
    await access(root, constants.W_OK);
    return "healthy";
  } catch {
    try {
      await mkdir(root, { recursive: true });
      await access(root, constants.W_OK);
      return "healthy";
    } catch {
      return "unavailable";
    }
  }
}

/**
 * Unauthenticated liveness/readiness probe for uptime monitoring + Caddy.
 * Phase F: application + database + storage + background-worker freshness.
 * Component semantics:
 *   - database/storage: healthy | unavailable (hard gate → 503)
 *   - jobs: healthy | stale | unknown — stale (worker ran before, now lagging
 *     or failing) fails readiness; unknown (worker never seen on this DB)
 *     stays warn-only unless JOBS_HEALTH_REQUIRED=1, so deploys that have not
 *     installed the jobs worker yet are not failed spuriously.
 */
export const GET = route(
  async () => {
    const db = await pingDb();
    const storage = await storageHealth();
    let jobs: Awaited<ReturnType<typeof jobHealth>> | null = null;
    let jobsStatus: "healthy" | "stale" | "unknown" = "unknown";
    try {
      jobs = await jobHealth();
      jobsStatus = !jobs.seen ? "unknown" : jobs.stale ? "stale" : "healthy";
    } catch {
      jobsStatus = "unknown";
    }

    const jobsRequired = process.env.JOBS_HEALTH_REQUIRED === "1";
    const jobsOk = jobsStatus === "healthy" || (jobsStatus === "unknown" && !jobsRequired);
    const ok = db && storage === "healthy" && jobsOk;

    const body = {
      ok,
      version: appVersion(),
      components: {
        database: db ? ("healthy" as const) : ("unavailable" as const),
        storage,
        jobs: jobs ? { status: jobsStatus, detail: jobs.jobs } : { status: jobsStatus, detail: [] },
      },
    };
    return NextResponse.json(body, { status: ok ? 200 : 503 });
  },
  { auth: false },
);
