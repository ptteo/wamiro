import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { listVendors, upsertVendor } from "@/modules/finance/service";

export const GET = route(
  async (_req: NextRequest, { auth }) => {
    return NextResponse.json({ vendors: await listVendors(auth) });
  },
  { permission: "finance.view_self" },
);

const schema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(200),
  category: z.string().max(80).optional(),
  contactName: z.string().max(120).optional(),
  contactEmail: z.string().max(200).optional(),
  status: z.string().max(20).optional(),
  notes: z.string().max(4000).optional(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Check the form", parsed.error.flatten());
    const id = await upsertVendor(auth, parsed.data);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  },
  { permission: "finance.view_self" },
);
