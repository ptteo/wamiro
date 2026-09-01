import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { provisioningUri, generateSecret, verifyTotp } from "@/lib/totp";
import { users } from "@/db/schema";

/** Current MFA status for the settings UI. */
export const GET = route(async (_req, { auth }) => {
  const [row] = await db
    .select({ totpEnabled: users.totpEnabled })
    .from(users)
    .where(eq(users.id, auth.user.id))
    .limit(1);
  return NextResponse.json({ enabled: row?.totpEnabled ?? false });
});

/**
 * Step 1: begin enrollment — generates a secret (not yet trusted) and
 * returns the otpauth:// URI + QR code image for the authenticator app.
 */
export const POST = route(async (_req: NextRequest, { auth }) => {
  const secret = generateSecret();
  await db.update(users).set({ totpSecret: secret }).where(eq(users.id, auth.user.id));
  const uri = provisioningUri(auth.user.email, secret);
  const qr = await import("qrcode").then((m) => m.toDataURL(uri, { margin: 1 }));
  return NextResponse.json({
    secret,
    uri,
    qrDataUrl: qr,
  });
});

/** Step 2: confirm a code to activate MFA. */
const enableSchema = z.object({ code: z.string().min(6).max(10) });

export const PUT = route(async (req: NextRequest, { auth }) => {
  const parsed = enableSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("6-digit code required");

  const [row] = await db
    .select({ secret: users.totpSecret })
    .from(users)
    .where(eq(users.id, auth.user.id))
    .limit(1);
  if (!row?.secret || !verifyTotp(row.secret, parsed.data.code)) {
    throw ApiError.badRequest("That code didn't match. Check your authenticator and try again.");
  }
  await db.update(users).set({ totpEnabled: true }).where(eq(users.id, auth.user.id));

  await audit({
    organizationId: auth.user.organizationId,
    actorUserId: auth.user.id,
    action: "MFA_ENABLED",
    entityType: "user",
    entityId: auth.user.id,
  });
  return NextResponse.json({ ok: true });
});

/** Turn MFA off — requires the current password. */
const disableSchema = z.object({ password: z.string().min(1).max(200) });

export const DELETE = route(async (req: NextRequest, { auth }) => {
  const parsed = disableSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("Password required");

  const [row] = await db
    .select({
      passwordHash: users.passwordHash,
      totpEnabled: users.totpEnabled,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, auth.user.id))
    .limit(1);
  if (!row?.totpEnabled) throw ApiError.badRequest("MFA is not enabled");

  const { verifyPassword } = await import("@/lib/password");
  if (!(await verifyPassword(parsed.data.password, row.passwordHash))) {
    await audit({
      organizationId: auth.user.organizationId,
      actorUserId: auth.user.id,
      action: "MFA_DISABLE_DENIED",
      entityType: "user",
      entityId: auth.user.id,
    });
    throw ApiError.unauthorized("Incorrect password");
  }

  await db
    .update(users)
    .set({ totpEnabled: false, totpSecret: null })
    .where(eq(users.id, auth.user.id));

  await audit({
    organizationId: auth.user.organizationId,
    actorUserId: auth.user.id,
    action: "MFA_DISABLED",
    entityType: "user",
    entityId: auth.user.id,
  });
  return NextResponse.json({ ok: true });
});
