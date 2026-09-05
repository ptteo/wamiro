import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { clearCustomDomain, getDomainState, setCustomDomain } from "@/modules/org/domain";

const bodySchema = z.object({ customDomain: z.string().max(253) });

export const GET = route(
  async (_req: NextRequest, { auth }) => {
    return NextResponse.json(await getDomainState(auth));
  },
  { permission: "settings.manage" },
);

export const PUT = route(
  async (req: NextRequest, { auth }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("customDomain is required");
    return NextResponse.json(await setCustomDomain(auth, parsed.data.customDomain));
  },
  { permission: "settings.manage" },
);

export const DELETE = route(
  async (_req: NextRequest, { auth }) => {
    return NextResponse.json(await clearCustomDomain(auth));
  },
  { permission: "settings.manage" },
);