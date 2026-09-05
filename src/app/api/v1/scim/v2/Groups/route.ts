import type { NextRequest } from "next/server";

import { scim401, scimOrgFromRequest } from "@/lib/scim-auth";
import { createGroup, listGroups } from "@/modules/scim/service";

const JSON_HEADERS = { "content-type": "application/scim+json" };

export const GET = async (req: NextRequest) => {
  const orgId = await scimOrgFromRequest(req);
  if (!orgId) return scim401();
  const groups = await listGroups(orgId);
  return Response.json(
    { schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"], totalResults: groups.length, Resources: groups },
    { status: 200, headers: JSON_HEADERS },
  );
};

export const POST = async (req: NextRequest) => {
  const orgId = await scimOrgFromRequest(req);
  if (!orgId) return scim401();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !body.displayName) {
    return Response.json({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], detail: "displayName is required", status: 400 }, { status: 400, headers: JSON_HEADERS });
  }
  try {
    return Response.json(await createGroup(orgId, body), { status: 201, headers: JSON_HEADERS });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Group create failed";
    return Response.json({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], detail, status: 400 }, { status: 400, headers: JSON_HEADERS });
  }
};