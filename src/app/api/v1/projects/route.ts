import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createProject, listProjects } from "@/modules/work/service";

export const GET = route(async (_req, { auth }) => {
  return NextResponse.json({ projects: await listProjects(auth) });
});

const createSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).nullish(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Project name required", parsed.error.flatten());
    const row = await createProject(auth, {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
    });
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
  },
);
