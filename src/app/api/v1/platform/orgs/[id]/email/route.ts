import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { renderBrandedEmail, sendEmail, appUrl } from "@/lib/mailer";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requirePlatformLevel } from "@/modules/platform/entitlements";

const bodySchema = z.object({
  subject: z.string().min(3).max(300),
  body: z.string().min(3).max(10_000),
});

/**
 * §4.1 quick action [Email tenant]: a direct operator→tenant-admin email,
 * audited and auto-logged as a CRM touchpoint so the timeline answers
 * "what have we sent this tenant lately?".
 */
export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    requirePlatformLevel(auth, "operator");
    const orgId = params["id"] ?? "";
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid email", parsed.error.flatten());

    const [org] = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!org) throw ApiError.notFound("Organization not found");

    const contacts = await db
      .selectDistinct({ email: users.email })
      .from(users)
      .innerJoin(organizations, eq(organizations.id, users.organizationId))
      .where(and(eq(organizations.id, orgId), eq(users.status, "active")))
      .limit(10);
    if (contacts.length === 0) throw ApiError.badRequest("No active users to email in this tenant");

    let emailed = 0;
    for (const c of contacts) {
      const html = renderBrandedEmail({
        title: parsed.data.subject,
        body: parsed.data.body,
        actionLabel: "Open Wamiro",
        actionUrl: appUrl(),
      });
      if (await sendEmail(c.email, parsed.data.subject, html)) emailed += 1;
    }

    // Timeline entry (best-effort — never fail the send over it).
    try {
      const { logOperatorEmailTouchpoint } = await import("@/modules/platform/crm");
      await logOperatorEmailTouchpoint(orgId, parsed.data.subject, emailed);
    } catch {
      // touchpoint logging is sugar
    }

    await audit({
      organizationId: null,
      actorUserId: auth.user.id,
      action: "PLATFORM_TENANT_EMAILED",
      entityType: "organization",
      entityId: orgId,
      newValue: { orgName: org.name, subject: parsed.data.subject.slice(0, 200), emailed },
    });
    return NextResponse.json({ ok: true, emailed });
  },
  { permission: "platform.admin" },
);
