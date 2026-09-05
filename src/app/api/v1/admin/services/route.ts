import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createItem, listForAdmin } from "@/modules/support-catalog/service";

export const GET = route(
  async (_req, { auth }) => {
    return NextResponse.json({ services: await listForAdmin(auth) });
  },
  { permission: "services.manage" },
);

const createSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  category: z.string().max(40).optional(),
  icon: z.string().max(40).optional(),
  expectedDays: z.number().int().min(0).max(365).nullable().optional(),
  approvalRequired: z.boolean().optional(),
  autoCreateTicket: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid service item", parsed.error.flatten());
    const row = await createItem(auth, parsed.data);
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
  },
  { permission: "services.manage" },
);