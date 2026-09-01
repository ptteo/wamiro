import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import {
  createSavedView,
  deleteSavedView,
  listSavedViews,
} from "@/lib/saved-views";

export const GET = route(
  async (_req: NextRequest, { auth, params }) => {
    const ws = params["workspace"] ?? "";
    return NextResponse.json({ views: await listSavedViews(auth, ws) });
  },
);

const createSchema = z.object({
  name: z.string().min(1).max(80),
  filters: z.record(z.string()),
});

export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    const ws = params["workspace"] ?? "";
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid view", parsed.error.flatten());
    await createSavedView(auth, { workspace: ws, ...parsed.data });
    return NextResponse.json({ ok: true }, { status: 201 });
  },
);

const deleteSchema = z.object({ id: z.string().uuid() });

export const DELETE = route(
  async (req: NextRequest, { auth }) => {
    const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("id required");
    await deleteSavedView(auth, parsed.data.id);
    return NextResponse.json({ ok: true });
  },
);
