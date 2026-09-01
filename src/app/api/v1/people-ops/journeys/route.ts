import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createJourney, listJourneys } from "@/modules/people-ops/service";

export const GET = route(
  async (req: NextRequest, { auth }) => {
    const kind = req.nextUrl.searchParams.get("kind") === "offboarding" ? "offboarding" : "onboarding";
    return NextResponse.json({ journeys: await listJourneys(auth, kind) });
  },
  { permission: "lifecycle.manage" },
);

const schema = z.object({
  kind: z.enum(["onboarding", "offboarding"]),
  userId: z.string().uuid(),
  dueDate: z.string().max(10).optional(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Check the form", parsed.error.flatten());
    const id = await createJourney(auth, parsed.data);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  },
  { permission: "lifecycle.manage" },
);
