import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { can } from "@/modules/iam/engine";
import { createAsset, listAll, listMine } from "@/modules/assets/service";

export const GET = route(async (_req, { auth }) => {
  if (can(auth.access, "assets.manage")) {
    return NextResponse.json({ scope: "all", assets: await listAll(auth) });
  }
  return NextResponse.json({ scope: "self", assets: await listMine(auth) });
});

const createSchema = z.object({
  name: z.string().min(2).max(120),
  category: z.enum(["laptop", "phone", "monitor", "other"]).optional(),
  serialNumber: z.string().max(120).nullish(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Asset name required", parsed.error.flatten());
    const id = await createAsset(auth, {
      name: parsed.data.name,
      category: parsed.data.category,
      serialNumber: parsed.data.serialNumber ?? null,
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  },
  { permission: "assets.manage" },
);
