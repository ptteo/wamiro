import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { getRecord, setOwner, updateStatus } from "@/modules/it-records/service";

export const GET = route(async (_req: NextRequest, { auth, params }) => {
  const id = params["id"] ?? "";
  if (!id) throw ApiError.badRequest("Record id required");
  return NextResponse.json({ record: await getRecord(auth, id) });
});

const patchSchema = z
  .object({
    status: z.string().min(1).max(40).optional(),
    ownerId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => v.status !== undefined || v.ownerId !== undefined, {
    message: "Provide status or ownerId",
  });

export const PATCH = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"] ?? "";
    if (!id) throw ApiError.badRequest("Record id required");
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid update", parsed.error.flatten());
    if (parsed.data.status !== undefined) await updateStatus(auth, id, parsed.data.status);
    if (parsed.data.ownerId !== undefined) await setOwner(auth, id, parsed.data.ownerId);
    return NextResponse.json({ ok: true });
  },
);