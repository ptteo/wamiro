import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { createPendingMfaToken, verifyPendingMfaToken } from "@/lib/pending-mfa";
import { verifyPassword } from "@/lib/password";
import { verifyTotp } from "@/lib/totp";
import { enforceRateLimit } from "@/lib/ratelimit";
import { SESSION_COOKIE, cookieOptions, createSession } from "@/lib/session";
import { emailAllowedForDomains } from "@/lib/email-domain";
import { isLocked, recordFailedLogin } from "@/modules/auth/passwords";
import { organizations, users } from "@/db/schema";

const bodySchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
  /** Second step: TOTP code + the pending token from step one. */
  mfaToken: z.string().max(1000).optional(),
  totpCode: z.string().max(10).optional(),
});

function isFormPost(req: NextRequest): boolean {
  const ct = req.headers.get("content-type") ?? "";
  return ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data");
}

function loginFail(req: NextRequest, form: boolean, error: ApiError): never | NextResponse {
  if (!form) throw error;
  const url = new URL("/login", req.url);
  url.searchParams.set("error", error.message);
  return NextResponse.redirect(url, 303);
}

async function readLoginBody(req: NextRequest) {
  if (isFormPost(req)) {
    const fd = await req.formData();
    return {
      form: true,
      parsed: bodySchema.safeParse({
        email: fd.get("email"),
        password: fd.get("password"),
        mfaToken: String(fd.get("mfaToken") ?? "") || undefined,
        totpCode: String(fd.get("totpCode") ?? "") || undefined,
      }),
    };
  }
  return { form: false, parsed: bodySchema.safeParse(await req.json().catch(() => null)) };
}

export const POST = route(
  async (req: NextRequest) => {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const form = isFormPost(req);
    // Phase D: shared (DB) limiter — holds across instances.
    await enforceRateLimit("ip", `login:${ip}`, {
      limit: Number(process.env.RATE_LIMIT_AUTH_PER_15MIN ?? 40),
      windowSeconds: 900,
    });

    const { parsed } = await readLoginBody(req);
    if (!parsed.success) return loginFail(req, form, ApiError.badRequest("Email and password required"));

    const email = parsed.data.email.trim().toLowerCase();
    const [row] = await db
      .select({
        orgBillingStatus: organizations.billingStatus,
        id: users.id,
        passwordHash: users.passwordHash,
        status: users.status,
        authMethod: users.authMethod,
        totpSecret: users.totpSecret,
        totpEnabled: users.totpEnabled,
        lockedUntil: users.lockedUntil,
        organizationId: users.organizationId,
        orgStatus: organizations.status,
        allowedEmailDomains: organizations.allowedEmailDomains,
      })
      .from(users)
      .innerJoin(organizations, eq(organizations.id, users.organizationId))
      .where(eq(users.email, email))
      .limit(1);

    if (row && isLocked(row.lockedUntil)) {
      return loginFail(
        req,
        form,
        ApiError.forbidden("This account is locked for 30 minutes after too many failed sign-ins."),
      );
    }

    // constant-ish behavior whether or not the account exists
    const ok = row && (await verifyPassword(parsed.data.password, row.passwordHash));
    if (!ok || !row) {
      if (row) {
        await recordFailedLogin(row.id, email, row.organizationId).catch((e) => {
          if (e instanceof ApiError) throw e;
        });
      }
      await audit({
        organizationId: null,
        actorUserId: null,
        action: "LOGIN_FAILED",
        entityType: "user",
        entityId: email,
        ip,
        userAgent: req.headers.get("user-agent"),
      });
      return loginFail(req, form, ApiError.unauthorized("Incorrect email or password"));
    }
    if (row.status === "invited") {
      return loginFail(req, form, ApiError.forbidden("Open the invite link we sent to set your password."));
    }
    if (!emailAllowedForDomains(email, row.allowedEmailDomains)) {
      return loginFail(req, form, ApiError.forbidden("This organization only allows company email addresses."));
    }
    if (row.status === "suspended" || row.orgStatus !== "active") {
      return loginFail(req, form, ApiError.forbidden("Account or organization suspended"));
    }
    if (row.authMethod === "sso") {
      return loginFail(req, form, ApiError.forbidden("This account uses single sign-on. Sign in with SSO instead."));
    }
    if (row.orgBillingStatus === "cancelled") {
      return loginFail(
        req,
        form,
        ApiError.forbidden("This organization's subscription has ended. Contact support to reactivate."),
      );
    }

    // ---- MFA second step ----
    let mfaToken = parsed.data.mfaToken;
    if (row.totpEnabled) {
      const pending =
        mfaToken && verifyPendingMfaToken(mfaToken, row.id, row.passwordHash);
      if (!pending) {
        // step one complete: issue a short-lived pending token, no session yet
        return NextResponse.json({
          ok: true,
          mfaRequired: true,
          mfaToken: createPendingMfaToken(row.id, row.passwordHash),
          redirect: null,
        });
      }
      if (!parsed.data.totpCode || !verifyTotp(row.totpSecret ?? "", parsed.data.totpCode)) {
        await audit({
          organizationId: null,
          actorUserId: row.id,
          action: "MFA_FAILED",
          entityType: "user",
          entityId: email,
          ip,
        });
        return loginFail(req, form, ApiError.unauthorized("Invalid authentication code"));
      }
      mfaToken = undefined; // consumed
    }

    const session = await createSession(row.id, {
      ip,
      userAgent: req.headers.get("user-agent"),
    });
    await db.update(users).set({ lastLoginAt: new Date(), lockedUntil: null }).where(eq(users.id, row.id));
    await audit({
      organizationId: null, // org resolved inside session; avoid pre-auth tenant claims in audit
      actorUserId: row.id,
      action: "USER_LOGIN",
      entityType: "session",
      ip,
      userAgent: req.headers.get("user-agent"),
    });

    const res = form
      ? NextResponse.redirect(new URL("/home", req.url), 303)
      : NextResponse.json({ ok: true, redirect: "/home" });
    res.cookies.set(SESSION_COOKIE, session.token, cookieOptions(session.expiresAt));
    return res;
  },
  { auth: false },
);
