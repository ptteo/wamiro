import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { decidePurchase } from "@/modules/finance/service";

const schema = z.object({
  action: z.enum(["approve", "reject", "order", "receive", "cancel"]),
  poNumber: z.string().max(80).optional(),
});

export const PATCH = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("id required");
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid action");
    await decidePurchase(auth, id, parsed.data.action, parsed.data.poNumber);
    return NextResponse.json({ ok: true });
  },
  { permission: "finance.view_self" },
);
