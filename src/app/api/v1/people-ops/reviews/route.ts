import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createCycle, listCycles, myReviewEntries, teamReviewEntries } from "@/modules/people-ops/service";

export const GET = route(
  async (req: NextRequest, { auth }) => {
    const cycleId = req.nextUrl.searchParams.get("cycleId");
    return NextResponse.json({
      cycles: await listCycles(auth),
      mine: await myReviewEntries(auth),
      team: cycleId ? await teamReviewEntries(auth, cycleId) : [],
    });
  },
  { auth: true },
);

const createSchema = z.object({
  name: z.string().min(2).max(120),
  periodLabel: z.string().min(2).max(40),
  selfDueAt: z.string().max(10).optional(),
  managerDueAt: z.string().max(10).optional(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Check the form", parsed.error.flatten());
    const id = await createCycle(auth, parsed.data);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  },
  { permission: "performance.manage" },
);
