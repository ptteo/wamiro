import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { listThresholds, setThresholds } from "@/modules/finance/service";

/** Phase 8 — approval chain per amount threshold (rule-based routing). */
export const GET = route(
  async (_req, { auth }) => NextResponse.json({ thresholds: await listThresholds(auth) }),
  { permission: "finance.approve" },
);

const bandSchema = z.object({
  minAmountCents: z.number().int().min(0),
  maxAmountCents: z.number().int().min(0).nullable(),
  approverMode: z.enum(["company", "manager"]),
  active: z.boolean().optional(),
});

const putSchema = z.object({ thresholds: z.array(bandSchema).max(20) });

export const PUT = route(
  async (req: NextRequest, { auth }) => {
    const parsed = putSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid threshold chain", parsed.error.flatten());
    const thresholds = await setThresholds(auth, parsed.data.thresholds);
    return NextResponse.json({ thresholds });
  },
  { permission: "finance.approve" },
);
