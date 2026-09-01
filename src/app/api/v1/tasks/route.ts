import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createTask, listMyTasks, listTeamTasks } from "@/modules/work/service";
import { can } from "@/modules/iam/engine";

export const GET = route(async (_req, { auth }) => {
  const [mine, team] = await Promise.all([
    listMyTasks(auth),
    can(auth.access, "tasks.view_team") ? listTeamTasks(auth) : [],
  ]);
  return NextResponse.json({ mine, team });
});

const createSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).nullish(),
  projectId: z.string().uuid().nullish(),
  assigneeId: z.string().uuid().nullish(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid task", parsed.error.flatten());
    const row = await createTask(auth, {
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      projectId: parsed.data.projectId ?? null,
      assigneeId: parsed.data.assigneeId ?? null,
      priority: parsed.data.priority,
      dueDate: parsed.data.dueDate ?? null,
    });
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
  },
);
