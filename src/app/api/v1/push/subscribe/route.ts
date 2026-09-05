import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { status, subscribe, unsubscribe } from "@/modules/push/service";

const bodySchema = z.object({
  endpoint: z.string().min(10).max(1000),
  p256dh: z.string().min(1).max(500),
  auth: z.string().min(1).max(200),
});

/** Push capability + this user's device count + VAPID key for subscribing. */
export const GET = route(
  async (_req: NextRequest, { auth, meta }) => {
    const s = await status(auth);
    return NextResponse.json({
      ...s,
      // echo UA for the client so it can label its own device
      userAgent: meta.userAgent,
    });
  },
  { auth: true },
);

/** Register this browser's push subscription. */
export const POST = route(
  async (req: NextRequest, { auth, meta }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("endpoint, p256dh and auth are required");
    return NextResponse.json(
      await subscribe(auth, parsed.data, meta.userAgent),
      { status: 201 },
    );
  },
  { auth: true },
);

/** Remove one of this user's subscriptions (body: { endpoint }). */
export const DELETE = route(
  async (req: NextRequest, { auth }) => {
    const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
    if (!body?.endpoint) throw ApiError.badRequest("endpoint is required");
    return NextResponse.json(await unsubscribe(auth, body.endpoint));
  },
  { auth: true },
);