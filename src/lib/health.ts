import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import { readFileSync } from "node:fs";

import { pingDb } from "@/lib/session";
import { jobHealth } from "@/modules/platform/jobs";

export interface HealthSnapshot {
  ok: boolean;
  version: string;
  components: {
    database: "healthy" | "unavailable";
    storage: "healthy" | "unavailable";
    jobs: { status: "healthy" | "stale" | "unknown"; detail: Awaited<ReturnType<typeof jobHealth>>["jobs"] };
  };
}

function appVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { version: string };
    return pkg.version;
  } catch {
    return "unknown";
  }
}

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

/** Shared by GET /api/v1/health, /ready, and the public /status page. */
export async function snapshotHealth(): Promise<HealthSnapshot> {
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

  return {
    ok,
    version: appVersion(),
    components: {
      database: db ? "healthy" : "unavailable",
      storage,
      jobs: jobs ? { status: jobsStatus, detail: jobs.jobs } : { status: jobsStatus, detail: [] },
    },
  };
}

export function overallStatus(snap: HealthSnapshot): "operational" | "degraded" | "down" {
  if (snap.ok) return "operational";
  if (snap.components.database === "unavailable") return "down";
  return "degraded";
}
