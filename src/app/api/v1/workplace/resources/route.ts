import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createResource, listResources } from "@/modules/workplace/service";

export const GET = route(
  async (_req: NextRequest, { auth }) => {
    return NextResponse.json({ resources: await listResources(auth) });
  },
  { permission: "workplace.view" },
);

const schema = z.object({
  name: z.string().min(2).max(120),
  kind: z.enum(["room", "desk", "resource"]).optional(),
  location: z.string().max(120).optional(),
  capacity: z.number().int().min(1).max(500).optional(),
  features: z.array(z.string().max(40)).max(10).optional(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Check the form", parsed.error.flatten());
    const id = await createResource(auth, parsed.data);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  },
  { permission: "workplace.view" },
);
