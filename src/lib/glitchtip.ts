/**
 * GlitchTip error reporter. Unset GLITCHTIP_DSN → no-op.
 * Speaks the store ingest API over fetch — no third-party error SDK.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface GlitchtipDsn {
  protocol: string;
  host: string;
  key: string;
  projectId: string;
}

export interface CaptureContext {
  requestId?: string;
  path?: string;
  orgId?: string;
  userId?: string;
}

export function isHealthProbePath(path: string): boolean {
  return (
    path === "/api/v1/health" ||
    path.startsWith("/api/v1/health/")
  );
}

export function parseGlitchtipDsn(dsn: string): GlitchtipDsn | null {
  const raw = dsn.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const key = decodeURIComponent(u.username);
    const projectId = u.pathname.replace(/\/+$/, "").split("/").filter(Boolean).pop();
    if (!key || !projectId || !u.host) return null;
    return { protocol: u.protocol.replace(":", ""), host: u.host, key, projectId };
  } catch {
    return null;
  }
}

export function glitchtipStoreUrl(parsed: GlitchtipDsn): string {
  return `${parsed.protocol}://${parsed.host}/api/${parsed.projectId}/store/`;
}

export function glitchtipRelease(): string {
  const fromEnv = process.env.GLITCHTIP_RELEASE?.trim();
  if (fromEnv) return fromEnv;
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { version?: string };
    return `wamiro@${pkg.version ?? "0.0.0"}`;
  } catch {
    return "wamiro@unknown";
  }
}

function framesFromStack(stack: string | undefined): { filename: string; function: string; lineno?: number; colno?: number; in_app: boolean }[] {
  if (!stack) return [];
  const frames: { filename: string; function: string; lineno?: number; colno?: number; in_app: boolean }[] = [];
  for (const line of stack.split("\n").slice(1, 21)) {
    const m = /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/.exec(line);
    if (!m) continue;
    const fn = m[1] ?? "<anonymous>";
    const file = m[2] ?? "";
    frames.push({
      filename: file,
      function: fn,
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: !file.includes("node_modules"),
    });
  }
  return frames.reverse();
}

export function buildGlitchtipEvent(err: unknown, ctx: CaptureContext = {}): Record<string, unknown> {
  const error = err instanceof Error ? err : new Error(String(err));
  const eventId = randomUUID().replace(/-/g, "");
  return {
    event_id: eventId,
    timestamp: new Date().toISOString(),
    platform: "node",
    level: "error",
    logger: "wamiro",
    release: glitchtipRelease(),
    environment: process.env.GLITCHTIP_ENVIRONMENT?.trim() || process.env.NODE_ENV || "development",
    exception: {
      values: [
        {
          type: error.name || "Error",
          value: error.message.slice(0, 2000),
          stacktrace: { frames: framesFromStack(error.stack) },
        },
      ],
    },
    tags: {
      ...(ctx.path ? { path: ctx.path } : {}),
      ...(ctx.requestId ? { request_id: ctx.requestId } : {}),
    },
    user: ctx.userId ? { id: ctx.userId } : undefined,
    extra: {
      ...(ctx.orgId ? { orgId: ctx.orgId } : {}),
      ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
    },
  };
}

/** Fire-and-forget. Never throws to the caller. */
export function captureException(err: unknown, ctx: CaptureContext = {}): void {
  if (ctx.path && isHealthProbePath(ctx.path)) return;
  const dsn = process.env.GLITCHTIP_DSN?.trim();
  if (!dsn) return;
  const parsed = parseGlitchtipDsn(dsn);
  if (!parsed) return;
  const body = JSON.stringify(buildGlitchtipEvent(err, ctx));
  const url = glitchtipStoreUrl(parsed);
  void fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=wamiro/0.1.0, sentry_key=${parsed.key}`,
    },
    body,
    signal: AbortSignal.timeout(2000),
  }).catch(() => {
    /* journald already has the error; ingest failure must not loop */
  });
}
