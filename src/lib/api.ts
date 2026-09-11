import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import "@/lib/event-consumers"; // R6 §33 — register domain-event consumers once

import { withTenantScope } from "./db";
import { ApiError } from "./errors";
import { enforceRateLimit, maybeSweep } from "./ratelimit";
import {
  loadAuthContext,
  tokenFromRequest,
  type AuthContext,
} from "./session";
import { can } from "@/modules/iam/engine";
import { captureException } from "@/lib/glitchtip";

export interface RouteMeta {
  requestId: string;
  ip: string | null;
  userAgent: string | null;
}

export type Handler = (
  req: NextRequest,
  ctx: { auth: AuthContext; meta: RouteMeta; params: Record<string, string> },
) => Promise<Response> | Response;

/**
 * Wrap an API route with: error model, request id, CSRF origin check
 * (mutations), session auth, optional permission gate.
 *
 * This is the ONLY way API routes authenticate. A route without this wrapper
 * has no auth context and cannot touch tenant data.
 */
export function route(
  handler: Handler,
  opts: { permission?: string; auth?: boolean } = {},
): (req: NextRequest, routeCtx: { params: Promise<Record<string, string>> }) => Promise<Response> {
  const requireAuth = opts.auth !== false;

  return async (req, routeCtx) => {
    const requestId = randomUUID();
    const meta: RouteMeta = {
      requestId,
      ip:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        req.headers.get("x-real-ip"),
      userAgent: req.headers.get("user-agent"),
    };

    let startedAt = 0;
    let auth: AuthContext | undefined;
    try {
      startedAt = Date.now();
      // CSRF hardening: state-changing requests must be same-origin.
      if (req.method !== "GET" && req.method !== "HEAD") {
        const origin = req.headers.get("origin");
        if (origin) {
          const host = req.headers.get("host");
          try {
            if (new URL(origin).host !== host) {
              throw ApiError.forbidden("Cross-origin request rejected");
            }
          } catch (e) {
            if (e instanceof ApiError) throw e;
            throw ApiError.forbidden("Invalid origin");
          }
        }
      }

      if (requireAuth) {
        const token = tokenFromRequest(req);
        if (!token) throw ApiError.unauthorized();
        auth = await loadAuthContext(token);
        if (opts.permission && !can(auth.access, opts.permission)) {
          throw ApiError.forbidden(`Missing permission: ${opts.permission}`);
        }
        const path = req.nextUrl.pathname;
        const { needsMfaSetup, onboardingComplete, isGatedApiPath, isMfaAllowedPath } = await import(
          "@/modules/org/policies"
        );
        if (needsMfaSetup(auth) && !isMfaAllowedPath(path)) {
          throw ApiError.forbidden("Enable MFA in Settings → Security to continue");
        }
        if (!onboardingComplete(auth.org.onboardingState) && isGatedApiPath(path)) {
          throw ApiError.forbidden("Finish company setup to use this feature");
        }

        // Phase D — platform-grade per-tenant rate limit on mutating calls.
        // Shared (DB-backed) so it holds across instances. Reads are exempt
        // to keep the DB write cost off the hot GET path.
        if (req.method !== "GET" && req.method !== "HEAD") {
          // Phase F — per-org limit.api_per_min entitlement overrides the
          // default (60 s cache; fail-open to the default on any error).
          let orgLimit = Number(process.env.RATE_LIMIT_ORG_PER_MIN ?? 600);
          try {
            const { apiRateOverride } = await import("@/modules/platform/entitlements");
            orgLimit = (await apiRateOverride(auth.user.organizationId)) ?? orgLimit;
          } catch {
            /* entitlement read is best-effort */
          }
          await enforceRateLimit("org", auth.user.organizationId, {
            limit: orgLimit,
            windowSeconds: 60,
          });
          maybeSweep();
        }
      }

      const params = routeCtx?.params ? await routeCtx.params : {};
      const handle = async () => handler(req, { auth: auth as AuthContext, meta, params });
      // Phase 4 — RLS defense-in-depth: run tenant requests with Postgres
      // row-level security scoped to the session's active org. Platform
      // operators (console, impersonation) stay unscoped — their queries
      // intentionally span tenants and the console's own permission gates
      // are the control.
      const response =
        auth && !can(auth.access, "platform.admin")
          ? await withTenantScope(auth.org.id, handle)
          : await handle();
      // §34 structured access log — one line per request, §21 safe context
      console.log(
        JSON.stringify({
          level: "info",
          msg: "request",
          requestId,
          method: req.method,
          path: req.nextUrl.pathname,
          status: response.status,
          durationMs: Date.now() - startedAt,
          ...(auth
            ? { orgId: auth.user.organizationId, userId: auth.user.id }
            : {}),
        }),
      );
      if (!response.headers.has("x-api-version")) {
        response.headers.set("x-api-version", "1");
      }
      return response;
    } catch (e) {
      if (e instanceof ApiError) {
        console.log(
          JSON.stringify({
            level: "info",
            msg: "request",
            requestId,
            method: req.method,
            path: req.nextUrl.pathname,
            status: e.status,
            durationMs: Date.now() - startedAt,
            category: e.code,
            ...(auth ? { orgId: auth.user.organizationId, userId: auth.user.id } : {}),
          }),
        );
        const err = NextResponse.json(
          { error: { code: e.code, message: e.message, request_id: requestId } },
          { status: e.status },
        );
        err.headers.set("x-api-version", "1");
        return err;
      }
      console.error(JSON.stringify({ level: "error", requestId, path: req.nextUrl.pathname, err: String(e), cause: String((e as { cause?: unknown }).cause ?? "") }));
      captureException(e, {
        requestId,
        path: req.nextUrl.pathname,
        orgId: auth?.user.organizationId,
        userId: auth?.user.id,
      });
      return NextResponse.json(
        {
          error: {
            code: "internal_error",
            message: "Something went wrong. Please try again.",
            request_id: requestId,
          },
        },
        { status: 500 },
      );
    }
  };
}
