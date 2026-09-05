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
import { organizations, users } from "@/db/schema";

const bodySchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
  /** Second step: TOTP code + the pending token from step one. */
  mfaToken: z.string().max(1000).optional(),
  totpCode: z.string().max(10).optional(),
});

export const POST = route(
  async (req: NextRequest) => {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    // Phase D: shared (DB) limiter — holds across instances.
    await enforceRateLimit("ip", `login:${ip}`, {
      limit: Number(process.env.RATE_LIMIT_AUTH_PER_15MIN ?? 40),
      windowSeconds: 900,
    });

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Email and password required");

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
        orgStatus: organizations.status,
      })
      .from(users)
      .innerJoin(organizations, eq(organizations.id, users.organizationId))
      .where(eq(users.email, email))
      .limit(1);

    // constant-ish behavior whether or not the account exists
    const ok = row && (await verifyPassword(parsed.data.password, row.passwordHash));
    if (!ok || !row) {
      await audit({
        organizationId: null,
        actorUserId: null,
        action: "LOGIN_FAILED",
        entityType: "user",
        entityId: email,
        ip,
        userAgent: req.headers.get("user-agent"),
      });
      throw ApiError.unauthorized("Incorrect email or password");
    }
    if (row.status === "suspended" || row.orgStatus !== "active") {
      throw ApiError.forbidden("Account or organization suspended");
    }
    if (row.authMethod === "sso") {
      throw ApiError.forbidden("This account uses single sign-on. Sign in with SSO instead.");
    }
    if (row.orgBillingStatus === "cancelled") {
      throw ApiError.forbidden("This organization's subscription has ended. Contact support to reactivate.");
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
        throw ApiError.unauthorized("Invalid authentication code");
      }
      mfaToken = undefined; // consumed
    }

    const session = await createSession(row.id, {
      ip,
      userAgent: req.headers.get("user-agent"),
    });
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, row.id));
    await audit({
      organizationId: null, // org resolved inside session; avoid pre-auth tenant claims in audit
      actorUserId: row.id,
      action: "USER_LOGIN",
      entityType: "session",
      ip,
      userAgent: req.headers.get("user-agent"),
    });

    const res = NextResponse.json({ ok: true, redirect: "/home" });
    res.cookies.set(SESSION_COOKIE, session.token, cookieOptions(session.expiresAt));
    return res;
  },
  { auth: false },
);
