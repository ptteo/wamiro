import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { addCandidateEvent, getCandidate } from "@/modules/people-ops/service";

export const GET = route(
  async (_req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("id required");
    return NextResponse.json(await getCandidate(auth, id));
  },
  { permission: "recruitment.manage" },
);

const schema = z.object({
  kind: z.string().max(20),
  payload: z.record(z.unknown()).optional(),
  scheduledAt: z.string().max(40).optional(),
});

export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("id required");
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid payload");
    await addCandidateEvent(auth, id, {
      kind: parsed.data.kind,
      payload: parsed.data.payload as Record<string, unknown> | undefined,
      scheduledAt: parsed.data.scheduledAt,
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  },
  { permission: "recruitment.manage" },
);
