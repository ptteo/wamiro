import type { NextRequest } from "next/server";

import { scim401, scimOrgFromRequest } from "@/lib/scim-auth";
import { createUser, listUsers } from "@/modules/scim/service";

export const GET = async (req: NextRequest) => {
  const orgId = await scimOrgFromRequest(req);
  if (!orgId) return scim401();
  const filter = new URL(req.url).searchParams.get("filter");
  const users = await listUsers(orgId, filter);
  return Response.json(
    {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults: users.length,
      Resources: users,
    },
    { status: 200, headers: { "content-type": "application/scim+json" } },
  );
};

export const POST = async (req: NextRequest) => {
  const orgId = await scimOrgFromRequest(req);
  if (!orgId) return scim401();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !Array.isArray(body.schemas) || !body.schemas.includes("urn:ietf:params:scim:schemas:core:2.0:User")) {
    return Response.json(
      { schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], detail: "User payload must declare the core User schema", status: 400 },
      { status: 400, headers: { "content-type": "application/scim+json" } },
    );
  }
  try {
    const user = await createUser(orgId, body);
    return Response.json(user, { status: 201, headers: { "content-type": "application/scim+json" } });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "SCIM create failed";
    const status = detail.includes("already exists") ? 409 : 400;
    return Response.json(
      { schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], detail, status },
      { status, headers: { "content-type": "application/scim+json" } },
    );
  }
};