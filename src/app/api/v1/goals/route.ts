import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createGoal, listGoals } from "@/modules/goals/service";

export const GET = route(async (_req, { auth }) => {
  return NextResponse.json({ goals: await listGoals(auth) });
});

const createSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(2000).nullish(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});

export const POST = route(async (req: NextRequest, { auth }) => {
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw ApiError.badRequest("Title required", parsed.error.flatten());
  const id = await createGoal(auth, {
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    dueDate: parsed.data.dueDate ?? null,
  });
  return NextResponse.json({ ok: true, id }, { status: 201 });
});
