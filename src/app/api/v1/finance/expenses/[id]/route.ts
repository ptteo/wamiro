import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { decideExpense, getExpense } from "@/modules/finance/service";

export const GET = route(
  async (_req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("id required");
    return NextResponse.json({ expense: await getExpense(auth, id) });
  },
  { permission: "finance.view_self" },
);

const schema = z.object({ action: z.enum(["approve", "reject", "reimburse", "cancel"]) });

export const PATCH = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("id required");
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid action");
    await decideExpense(auth, id, parsed.data.action);
    return NextResponse.json({ ok: true });
  },
  { permission: "finance.view_self" },
);
