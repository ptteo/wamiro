import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { closeJob, createJob, listCandidates, listJobs } from "@/modules/people-ops/service";

export const GET = route(
  async (_req: NextRequest, { auth }) => {
    return NextResponse.json({ jobs: await listJobs(auth), candidates: await listCandidates(auth) });
  },
  { permission: "recruitment.manage" },
);

const createSchema = z.object({
  title: z.string().min(2).max(200),
  departmentId: z.string().uuid().optional(),
  location: z.string().max(120).optional(),
  employmentType: z.string().max(40).optional(),
  openings: z.number().int().min(1).max(50).optional(),
  hiringManagerUserId: z.string().uuid().optional(),
  description: z.string().max(5000).optional(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Check the form", parsed.error.flatten());
    const id = await createJob(auth, parsed.data);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  },
  { permission: "recruitment.manage" },
);

const closeSchema = z.object({ id: z.string().uuid() });

export const PATCH = route(
  async (req: NextRequest, { auth }) => {
    const parsed = closeSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("id required");
    await closeJob(auth, parsed.data.id);
    return NextResponse.json({ ok: true });
  },
  { permission: "recruitment.manage" },
);
