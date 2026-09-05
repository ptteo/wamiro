import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { deleteWebhook, testDelivery, updateWebhook } from "@/modules/webhooks/service";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  url: z.string().min(4).max(2000).optional(),
  events: z.array(z.string().max(80)).max(50).optional(),
  active: z.boolean().optional(),
});

export const PATCH = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    if (!id) throw ApiError.badRequest("Webhook id required");
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid webhook", parsed.error.flatten());
    return NextResponse.json(await updateWebhook(auth, id, parsed.data));
  },
  { permission: "settings.manage" },
);

export const DELETE = route(
  async (_req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    if (!id) throw ApiError.badRequest("Webhook id required");
    await deleteWebhook(auth, id);
    return NextResponse.json({ ok: true });
  },
  { permission: "settings.manage" },
);

export const POST = route(
  async (_req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    if (!id) throw ApiError.badRequest("Webhook id required");
    return NextResponse.json(await testDelivery(auth, id));
  },
  { permission: "settings.manage" },
);