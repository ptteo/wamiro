import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import { hashPassword } from "@/lib/password";
import { SESSION_COOKIE, cookieOptions, createSession } from "@/lib/session";
import { provisionOrganization } from "@/modules/org/service";
import { sendWelcomeEmail } from "@/lib/mail/activation";

const bodySchema = z.object({
  companyName: z.string().min(2).max(100),
  adminName: z.string().min(2).max(80),
  email: z.string().email().max(200),
  password: z.string().min(10).max(200),
});

export const POST = route(
  async (req: NextRequest) => {
    // Phase D: shared (DB) limiter; configurable so bulk customer onboarding
    // (100-company programs) is possible — default stays conservative.
    await enforceRateLimit(
      "ip",
      `register:${req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"}`,
      { limit: Number(process.env.REGISTER_RATE_LIMIT_PER_HOUR ?? 20), windowSeconds: 3600 },
    );

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.badRequest("Check the form fields", parsed.error.flatten());
    }
    const { companyName, adminName, email, password } = parsed.data;

    const passwordHash = await hashPassword(password);
    const { orgId, userId } = await provisionOrganization({
      companyName,
      adminName,
      adminEmail: email,
      adminPasswordHash: passwordHash,
    });

    const session = await createSession(userId, {
      ip: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
    });

    await audit({
      organizationId: orgId,
      actorUserId: userId,
      action: "ORG_CREATED",
      entityType: "organization",
      entityId: orgId,
      newValue: { name: companyName },
      ip: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
    });

    // Activation (Phase A): nudge the admin into setup when email is wired.
    void sendWelcomeEmail({ to: email, orgName: companyName, adminName }).catch(() => {});

    const res = NextResponse.json({ ok: true, redirect: "/setup" }, { status: 201 });
    res.cookies.set(SESSION_COOKIE, session.token, cookieOptions(session.expiresAt));
    return res;
  },
  { auth: false },
);
