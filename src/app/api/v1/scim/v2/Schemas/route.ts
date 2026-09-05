import type { NextRequest } from "next/server";

import { scim401, scimOrgFromRequest } from "@/lib/scim-auth";

export const GET = async (req: NextRequest) => {
  const orgId = await scimOrgFromRequest(req);
  if (!orgId) return scim401();
  const user = {
    id: "urn:ietf:params:scim:schemas:core:2.0:User",
    name: "User",
    attributes: [
      { name: "userName", type: "string", mutability: "readWrite", required: true },
      { name: "name", type: "complex", mutability: "readWrite", required: false },
      { name: "emails", type: "complex", mutability: "readWrite", required: false },
      { name: "active", type: "boolean", mutability: "readWrite", required: false },
      { name: "title", type: "string", mutability: "readWrite", required: false },
    ],
    meta: { resourceType: "Schema" },
  };
  return Response.json(
    {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults: 2,
      Resources: [user, { id: "urn:ietf:params:scim:schemas:core:2.0:Group", name: "Group", attributes: [], meta: { resourceType: "Schema" } }],
    },
    { status: 200, headers: { "content-type": "application/scim+json" } },
  );
};