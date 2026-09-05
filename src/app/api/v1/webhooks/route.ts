import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createWebhook, listWebhooks } from "@/modules/webhooks/service";

export const GET = route(
  async (_req: NextRequest, { auth }) => {
    return NextResponse.json({ webhooks: await listWebhooks(auth) });
  },
  { permission: "settings.manage" },
);

const createSchema = z.object({
  name: z.string().min(1).max(120),
  url: z.string().min(4).max(2000),
  events: z.array(z.string().max(80)).max(50).optional(),
  active: z.boolean().optional(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid webhook", parsed.error.flatten());
    return NextResponse.json(await createWebhook(auth, parsed.data), { status: 201 });
  },
  { permission: "settings.manage" },
);