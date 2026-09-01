import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { setEnrollmentProgress } from "@/modules/people-ops/service";

const schema = z.object({ status: z.enum(["in_progress", "completed"]) });

export const PATCH = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("id required");
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid status");
    await setEnrollmentProgress(auth, id, parsed.data.status);
    return NextResponse.json({ ok: true });
  },
  { auth: true },
);
