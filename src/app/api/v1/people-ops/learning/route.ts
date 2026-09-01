import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { enroll, listCourses, myEnrollments } from "@/modules/people-ops/service";

export const GET = route(
  async (_req: NextRequest, { auth }) => {
    return NextResponse.json({ courses: await listCourses(auth), mine: await myEnrollments(auth) });
  },
  { permission: "learning.view" },
);

const enrollSchema = z.object({
  courseId: z.string().uuid(),
  userIds: z.array(z.string().uuid()).max(200),
  dueAt: z.string().max(10).optional(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = enrollSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Check the form", parsed.error.flatten());
    await enroll(auth, parsed.data.courseId, parsed.data.userIds, parsed.data.dueAt);
    return NextResponse.json({ ok: true }, { status: 201 });
  },
  { permission: "learning.view" },
);
