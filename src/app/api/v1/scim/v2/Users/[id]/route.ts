import type { NextRequest } from "next/server";

import { scim401, scimOrgFromRequest } from "@/lib/scim-auth";
import { deactivateUser, getUser, patchUser } from "@/modules/scim/service";

const JSON_HEADERS = { "content-type": "application/scim+json" };

export const GET = async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const orgId = await scimOrgFromRequest(req);
  if (!orgId) return scim401();
  const { id } = await ctx.params;
  try {
    return Response.json(await getUser(orgId, id), { status: 200, headers: JSON_HEADERS });
  } catch {
    return Response.json({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], detail: "User not found", status: 404 }, { status: 404, headers: JSON_HEADERS });
  }
};

export const PATCH = async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const orgId = await scimOrgFromRequest(req);
  if (!orgId) return scim401();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], detail: "Invalid PATCH body", status: 400 }, { status: 400, headers: JSON_HEADERS });
  try {
    return Response.json(await patchUser(orgId, id, body), { status: 200, headers: JSON_HEADERS });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "PATCH failed";
    return Response.json({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], detail, status: 404 }, { status: 404, headers: JSON_HEADERS });
  }
};

export const DELETE = async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const orgId = await scimOrgFromRequest(req);
  if (!orgId) return scim401();
  const { id } = await ctx.params;
  try {
    await deactivateUser(orgId, id);
    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], detail: "User not found", status: 404 }, { status: 404, headers: JSON_HEADERS });
  }
};