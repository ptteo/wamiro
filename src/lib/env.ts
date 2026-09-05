import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Lazy env access — never validate at import time so `next build` works
 * without a database (blueprint: build must not require runtime secrets).
 */

// Next.js loads .env automatically; standalone scripts (seed, integration
// tests) don't — this fills that gap without a dotenv dependency.
let loaded = false;
function loadDotEnvOnce(): void {
  if (loaded) return;
  loaded = true;
  try {
    for (const line of readFileSync(join(process.cwd(), ".env"), "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      const key = m?.[1];
      const value = m?.[2];
      if (key && value !== undefined && process.env[key] === undefined) {
        process.env[key] = value.replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* no .env file — fine */
  }
}

function required(name: string): string {
  loadDotEnvOnce();
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example.`,
    );
  }
  return v;
}

export const env = {
  get DATABASE_URL() {
    return required("DATABASE_URL");
  },
  get APP_URL(): string {
    loadDotEnvOnce();
    return process.env.APP_URL ?? "http://localhost:3000";
  },
  /** Extra hosts treated as platform (comma-separated, hostname[:port] each). */
  get PLATFORM_HOSTS(): string[] {
    loadDotEnvOnce();
    return (process.env.PLATFORM_HOSTS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  },
  get VAPID_PUBLIC_KEY(): string | undefined {
    loadDotEnvOnce();
    return process.env.VAPID_PUBLIC_KEY || undefined;
  },
  get VAPID_PRIVATE_KEY(): string | undefined {
    loadDotEnvOnce();
    return process.env.VAPID_PRIVATE_KEY || undefined;
  },
  get VAPID_SUBJECT(): string {
    loadDotEnvOnce();
    return process.env.VAPID_SUBJECT ?? `mailto:admin@${hostOnly(process.env.APP_URL ?? "localhost")}`;
  },
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
};

/** "example.com:3000" → "example.com" (also strips IPv6 brackets). */
export function hostOnly(host: string): string {
  const h = host.trim().toLowerCase();
  if (h.startsWith("[")) {
    const end = h.indexOf("]");
    return end > -1 ? h.slice(0, end) : h;
  }
  const colon = h.lastIndexOf(":");
  // A colon only separates a port when the label after it is numeric.
  const after = colon > -1 ? h.slice(colon + 1) : "";
  if (after && /^\d+$/.test(after)) return h.slice(0, colon);
  return h;
}
