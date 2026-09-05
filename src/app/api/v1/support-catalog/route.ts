import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { listCatalog, requestService } from "@/modules/support-catalog/service";

export const GET = route(async (_req, { auth }) => {
  return NextResponse.json({ services: await listCatalog(auth) });
});

const requestSchema = z.object({
  itemId: z.string().uuid(),
  details: z.string().max(5000).optional().default(""),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid service request", parsed.error.flatten());
    const result = await requestService(auth, parsed.data.itemId, parsed.data.details);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  },
);