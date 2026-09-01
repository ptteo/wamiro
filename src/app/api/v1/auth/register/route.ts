import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import { hashPassword } from "@/lib/password";
import { SESSION_COOKIE, cookieOptions, createSession } from "@/lib/session";
import { provisionOrganization } from "@/modules/org/service";

const bodySchema = z.object({
  companyName: z.string().min(2).max(100),
  adminName: z.string().min(2).max(80),
  email: z.string().email().max(200),
  password: z.string().min(10).max(200),
});

// ponytail: in-memory limiter is per-instance; move to shared store only when >1 instance
const attempts = new Map<string, { count: number; resetAt: number }>();
function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || rec.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  rec.count += 1;
  if (rec.count > max) throw ApiError.rateLimited();
}

export const POST = route(
  async (req: NextRequest) => {
    // R12 §57: configurable so bulk customer onboarding (100-company programs) is possible; default stays conservative.
  rateLimit(`register:${req.headers.get("x-forwarded-for") ?? "local"}`, Number(process.env.REGISTER_RATE_LIMIT_PER_HOUR ?? 20), 3_600_000);

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

    const res = NextResponse.json({ ok: true, redirect: "/home" }, { status: 201 });
    res.cookies.set(SESSION_COOKIE, session.token, cookieOptions(session.expiresAt));
    return res;
  },
  { auth: false },
);
