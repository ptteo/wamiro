import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { vote } from "@/modules/surveys/service";

const bodySchema = z.object({ optionIndex: z.number().int().min(0).max(7) });

export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Survey id required");
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid option");
    await vote(auth, id, parsed.data.optionIndex);
    return NextResponse.json({ ok: true });
  },
);
