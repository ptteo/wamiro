import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createCandidate, listCandidates, moveCandidateStage } from "@/modules/people-ops/service";

export const GET = route(
  async (req: NextRequest, { auth }) => {
    const sp = req.nextUrl.searchParams;
    return NextResponse.json({
      candidates: await listCandidates(auth, {
        stage: sp.get("stage") ?? undefined,
        openingId: sp.get("openingId") ?? undefined,
      }),
    });
  },
  { permission: "recruitment.manage" },
);

const createSchema = z.object({
  name: z.string().min(2).max(200),
  email: z.string().max(200).optional(),
  source: z.string().max(120).optional(),
  openingId: z.string().uuid().optional(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Check the form", parsed.error.flatten());
    const id = await createCandidate(auth, parsed.data);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  },
  { permission: "recruitment.manage" },
);

const patchSchema = z.object({ id: z.string().uuid(), stage: z.string().min(2).max(20) });

export const PATCH = route(
  async (req: NextRequest, { auth }) => {
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid payload");
    await moveCandidateStage(auth, parsed.data.id, parsed.data.stage);
    return NextResponse.json({ ok: true });
  },
  { permission: "recruitment.manage" },
);
