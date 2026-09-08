import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { verifyPaddleSignature } from "@/modules/billing/paddle-sign";
import { applyPaddleEvent } from "@/modules/billing/webhook";

/**
 * Paddle → Wamiro. Signature-verified, idempotent on event_id.
 * Paddle does not send Origin, so the CSRF check in route() is skipped.
 */
export const POST = route(
  async (req: NextRequest) => {
    const secret = process.env.PADDLE_WEBHOOK_SECRET?.trim();
    if (!secret) throw ApiError.unavailable("Billing webhook is not configured");
    const raw = await req.text();
    const header = req.headers.get("paddle-signature") ?? "";
    if (!verifyPaddleSignature(header, raw, secret)) {
      throw ApiError.unauthorized("Invalid Paddle signature");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw ApiError.badRequest("Invalid JSON");
    }
    const result = await applyPaddleEvent(parsed);
    return NextResponse.json({ ok: true, ...result });
  },
  { auth: false },
);
