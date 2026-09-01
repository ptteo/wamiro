import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { addProjectMember } from "@/modules/work/service";

const bodySchema = z.object({ email: z.string().email().max(200) });

export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Project id required");
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Valid email required");
    await addProjectMember(auth, id, parsed.data.email);
    return NextResponse.json({ ok: true }, { status: 201 });
  },
);
