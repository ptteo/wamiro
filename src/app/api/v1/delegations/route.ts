import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import {
  createDelegation,
  listMyDelegations,
  revokeDelegation,
} from "@/modules/approvals/delegation";

export const GET = route(async (_req, { auth }) => {
  return NextResponse.json({ delegations: await listMyDelegations(auth) });
});

const createSchema = z.object({
  delegateEmail: z.string().email(),
  reason: z.string().min(3).max(300),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid delegation", parsed.error.flatten());
    await createDelegation(auth, parsed.data);
    return NextResponse.json({ ok: true }, { status: 201 });
  },
  { permission: "requests.approve" },
);

const deleteSchema = z.object({ id: z.string().uuid() });

export const DELETE = route(
  async (req: NextRequest, { auth }) => {
    const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("id required");
    await revokeDelegation(auth, parsed.data.id);
    return NextResponse.json({ ok: true });
  },
  { permission: "requests.approve" },
);
