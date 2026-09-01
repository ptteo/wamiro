import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { sign } from "@/modules/acknowledgements/service";

const bodySchema = z.object({ signatureName: z.string().min(2).max(120) });

export const POST = route(async (req: NextRequest, { auth, params }) => {
  const id = params["id"];
  if (!id) throw ApiError.badRequest("Acknowledgement id required");
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("Type your full name to sign");

  await sign(
    auth,
    id,
    parsed.data.signatureName,
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  );
  return NextResponse.json({ ok: true });
});
