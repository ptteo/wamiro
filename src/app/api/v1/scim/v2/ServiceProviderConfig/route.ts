import type { NextRequest } from "next/server";

import { scim401, scimOrgFromRequest } from "@/lib/scim-auth";

export const GET = async (req: NextRequest) => {
  const orgId = await scimOrgFromRequest(req);
  if (!orgId) return scim401();
  return Response.json(
    {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
      documentationUri: "/docs/scim",
      patch: { supported: true },
      bulk: { supported: false },
      filter: { supported: true, maxResults: 200 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [{ type: "oauthbearertoken", name: "OAuth Bearer Token", description: "Per-org SCIM bearer token" }],
      meta: { resourceType: "ServiceProviderConfig" },
    },
    { status: 200, headers: { "content-type": "application/scim+json" } },
  );
};