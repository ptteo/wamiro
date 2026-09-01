import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { listFavorites, toggle } from "@/modules/favorites/service";

export const GET = route(async (_req, { auth }) => {
  return NextResponse.json({
    favorites: await listFavorites(auth.user.organizationId, auth.user.id),
  });
});

const toggleSchema = z.object({
  kind: z.enum(["project", "article"]),
  refId: z.string().uuid(),
});

export const POST = route(async (req: NextRequest, { auth }) => {
  const parsed = toggleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("kind and refId required");
  return NextResponse.json(await toggle(auth.user.organizationId, auth.user.id, parsed.data.kind, parsed.data.refId));
});
