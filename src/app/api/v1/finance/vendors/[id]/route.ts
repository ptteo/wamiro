import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { addVendorDocument, getVendor } from "@/modules/finance/service";

export const GET = route(
  async (_req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("id required");
    return NextResponse.json(await getVendor(auth, id));
  },
  { permission: "finance.view_self" },
);

const schema = z.object({
  fileName: z.string().min(1).max(300),
  kind: z.string().max(20).optional(),
  expiresAt: z.string().max(10).optional(),
});

export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("id required");
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Check the form", parsed.error.flatten());
    await addVendorDocument(auth, id, parsed.data);
    return NextResponse.json({ ok: true }, { status: 201 });
  },
  { permission: "finance.manage_vendors" },
);
