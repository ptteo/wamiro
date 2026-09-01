import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { checkReplay, record } from "@/lib/idempotency";
import { apply, listTypes, myRequests, pendingForApprover } from "@/modules/requests/service";

export const GET = route(async (_req, { auth }) => {
  const [types, mine, pending] = await Promise.all([
    listTypes(auth),
    myRequests(auth),
    pendingForApprover(auth),
  ]);
  return NextResponse.json({ types, mine, pending });
});

const applySchema = z.object({
  typeId: z.string().uuid(),
  payload: z.record(z.unknown()),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = applySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid request", parsed.error.flatten());

    // §51 replay protection — retried submissions must not duplicate
    const idemKey = req.headers.get("idempotency-key");
    if (idemKey) {
      const replay = await checkReplay(auth.user.id, idemKey);
      if (replay) return NextResponse.json(replay.body, { status: replay.status });
    }

    const created = await apply(auth, parsed.data);
    const body = { ok: true, id: created.id };
    if (idemKey) await record(auth.user.id, idemKey, { status: 201, body });
    return NextResponse.json(body, { status: 201 });
  },
);
