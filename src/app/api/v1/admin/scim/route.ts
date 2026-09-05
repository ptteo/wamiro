import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { route } from "@/lib/api";
import { db } from "@/lib/db";
import { organizations } from "@/db/schema";
import { disableScim, newScimToken } from "@/modules/scim/service";

const MASK = "••••••••••••••••••••••••••••••••";

/** Provisioning status — token is masked after creation (never shown again). */
export const GET = route(
  async (_req: NextRequest, { auth }) => {
    const [org] = await db
      .select({ enabled: organizations.scimEnabled, tokenSet: organizations.scimTokenHash })
      .from(organizations)
      .where(eq(organizations.id, auth.user.organizationId))
      .limit(1);
    return NextResponse.json({
      enabled: org?.enabled ?? false,
      tokenSet: org?.tokenSet ? true : false,
      token: org?.tokenSet ? MASK : null,
    });
  },
  { permission: "settings.manage" },
);

/** Generate a fresh bearer token (returns it exactly once) and enable SCIM. */
export const POST = route(
  async (_req: NextRequest, { auth }) => {
    const token = await newScimToken(auth.user.organizationId);
    return NextResponse.json({ enabled: true, token }, { status: 201 });
  },
  { permission: "settings.manage" },
);

/** Disable provisioning and revoke the token. */
export const DELETE = route(
  async (_req: NextRequest, { auth }) => {
    await disableScim(auth.user.organizationId);
    return NextResponse.json({ enabled: false, token: null });
  },
  { permission: "settings.manage" },
);