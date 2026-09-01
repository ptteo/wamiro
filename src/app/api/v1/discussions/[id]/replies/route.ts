import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { addReply } from "@/modules/discussions/service";

const bodySchema = z.object({ body: z.string().min(1).max(10_000) });

export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Discussion id required");
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Reply body required");
    const row = await addReply(auth, id, parsed.data.body);
    return NextResponse.json({ ok: true, id: row?.id }, { status: 201 });
  },
);
