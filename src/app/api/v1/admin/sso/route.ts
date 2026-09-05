import { NextResponse } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { deleteConfig, getConfig, saveConfig } from "@/modules/sso/service";

const bodySchema = z.object({
  name: z.string().max(120).optional(),
  provider: z.enum(["oidc", "saml"]).optional(),
  issuer: z.string().min(1).max(500),
  clientId: z.string().max(500).nullable().optional(),
  clientSecret: z.string().max(1000).nullable().optional(),
  discoveryUrl: z.string().max(500).nullable().optional(),
  metadataUrl: z.string().max(500).nullable().optional(),
  jitProvision: z.boolean().optional(),
  defaultRoleKey: z.string().max(80).optional(),
});

/** Current SSO configuration (secret masked). */
export const GET = route(
  async (_req, { auth }) => {
    const config = await getConfig(auth.user.organizationId);
    return NextResponse.json({ config });
  },
  { permission: "settings.manage" },
);

/** Create or update the SSO configuration. */
export const PUT = route(
  async (req, { auth }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid SSO configuration");
    const config = await saveConfig(auth.user.organizationId, auth.user.id, parsed.data);
    return NextResponse.json({ config });
  },
  { permission: "settings.manage" },
);

/** Remove the SSO configuration entirely. */
export const DELETE = route(
  async (_req, { auth }) => {
    return NextResponse.json(await deleteConfig(auth.user.organizationId, auth.user.id));
  },
  { permission: "settings.manage" },
);