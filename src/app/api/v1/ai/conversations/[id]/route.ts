import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { renameConversation } from "@/modules/ai/conversations";

const titleSchema = z.object({ title: z.string().min(1).max(200) });

/** PATCH /api/v1/ai/conversations/:id  { title } */
export const PATCH = route(async (req: NextRequest, { auth, params }) => {
  if (!isModuleEnabled(auth.org.modules, "ai")) {
    throw ApiError.forbidden("AI module is disabled for your organization");
  }
  const parsed = titleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("title required", parsed.error.flatten());
  if (!params.id) throw ApiError.badRequest("id required");
  await renameConversation(auth, params.id, parsed.data.title);
  return NextResponse.json({ ok: true });
});
