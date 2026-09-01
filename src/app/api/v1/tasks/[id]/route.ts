import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { updateTaskStatus } from "@/modules/work/service";

const patchSchema = z.object({
  status: z.enum(["backlog", "todo", "in_progress", "blocked", "done", "cancelled"]),
});

export const PATCH = route(async (req: NextRequest, { auth, params }) => {
  const id = params["id"];
  if (!id) throw ApiError.badRequest("Task id required");
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("Invalid status");
  await updateTaskStatus(auth, id, parsed.data.status);
  return NextResponse.json({ ok: true });
});
