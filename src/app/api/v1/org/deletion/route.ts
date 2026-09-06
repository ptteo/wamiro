import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import {
  cancelOrganizationDeletion,
  deletionStatus,
  requestOrganizationDeletion,
} from "@/modules/org/service";

/**
 * Phase 4 GDPR — staged delete-my-company:
 *   GET    current deletion-request state (undo window)
 *   POST   { confirm: "<exact org name>" } → queue deletion, 7-day undo window
 *   DELETE cancel a pending deletion request
 */
export const GET = route(async (_req, { auth }) => {
  return NextResponse.json({ status: await deletionStatus(auth) });
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const body = (await req.json().catch(() => null)) as { confirm?: string } | null;
    if (!body || typeof body.confirm !== "string" || body.confirm.trim().length === 0) {
      throw ApiError.badRequest("confirm field (exact company name) is required");
    }
    const result = await requestOrganizationDeletion(auth, body.confirm);
    return NextResponse.json(result);
  },
  { permission: "settings.manage" },
);

export const DELETE = route(
  async (_req, { auth }) => {
    await cancelOrganizationDeletion(auth);
    return NextResponse.json({ ok: true });
  },
  { permission: "settings.manage" },
);