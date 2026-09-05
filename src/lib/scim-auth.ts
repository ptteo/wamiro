import type { NextRequest } from "next/server";

import { orgForToken } from "@/modules/scim/service";

/** Resolve the provisioning org from the Authorization header, or null. */
export async function scimOrgFromRequest(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m?.[1]) return null;
  const org = await orgForToken(m[1]);
  return org?.orgId ?? null;
}

export function scim401() {
  return Response.json(
    {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      detail: "Invalid or missing bearer token",
      status: 401,
    },
    { status: 401, headers: { "content-type": "application/scim+json" } },
  );
}