import type { NextRequest } from "next/server";

import { scim401, scimOrgFromRequest } from "@/lib/scim-auth";
import { deleteGroup, listGroups, patchGroup } from "@/modules/scim/service";

const JSON_HEADERS = { "content-type": "application/scim+json" };

export const GET = async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const orgId = await scimOrgFromRequest(req);
  if (!orgId) return scim401();
  const { id } = await ctx.params;
  const groups = await listGroups(orgId);
  const group = groups.find((g) => g.id === id);
  if (!group) return Response.json({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], detail: "Group not found", status: 404 }, { status: 404, headers: JSON_HEADERS });
  return Response.json(group, { status: 200, headers: JSON_HEADERS });
};

export const PATCH = async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const orgId = await scimOrgFromRequest(req);
  if (!orgId) return scim401();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], detail: "Invalid PATCH body", status: 400 }, { status: 400, headers: JSON_HEADERS });
  try {
    return Response.json(await patchGroup(orgId, id, body), { status: 200, headers: JSON_HEADERS });
  } catch {
    return Response.json({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], detail: "Group not found", status: 404 }, { status: 404, headers: JSON_HEADERS });
  }
};

export const DELETE = async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const orgId = await scimOrgFromRequest(req);
  if (!orgId) return scim401();
  const { id } = await ctx.params;
  try {
    await deleteGroup(orgId, id);
    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], detail: "Group not found", status: 404 }, { status: 404, headers: JSON_HEADERS });
  }
};