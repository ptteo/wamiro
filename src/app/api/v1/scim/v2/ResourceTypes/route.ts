import type { NextRequest } from "next/server";

import { scim401, scimOrgFromRequest } from "@/lib/scim-auth";

export const GET = async (req: NextRequest) => {
  const orgId = await scimOrgFromRequest(req);
  if (!orgId) return scim401();
  return Response.json(
    {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults: 2,
      Resources: [
        {
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"],
          id: "User",
          name: "User",
          endpoint: "/Users",
          schema: "urn:ietf:params:scim:schemas:core:2.0:User",
          meta: { resourceType: "ResourceType" },
        },
        {
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"],
          id: "Group",
          name: "Group",
          endpoint: "/Groups",
          schema: "urn:ietf:params:scim:schemas:core:2.0:Group",
          meta: { resourceType: "ResourceType" },
        },
      ],
    },
    { status: 200, headers: { "content-type": "application/scim+json" } },
  );
};