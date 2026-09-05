import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { updateItem } from "@/modules/support-catalog/service";

const patchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  category: z.string().max(40).optional(),
  icon: z.string().max(40).nullable().optional(),
  expectedDays: z.number().int().min(0).max(365).nullable().optional(),
  approvalRequired: z.boolean().optional(),
  autoCreateTicket: z.boolean().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

export const PATCH = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    if (!id) throw ApiError.badRequest("Service id required");
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid service item", parsed.error.flatten());
    await updateItem(auth, id, parsed.data);
    return NextResponse.json({ ok: true });
  },
  { permission: "services.manage" },
);