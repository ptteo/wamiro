import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { listAlertRules, updateAlertRule } from "@/modules/platform/alerts";

/** Phase D — alert rule editor (§4.3): enable/disable, threshold, action. */
export const GET = route(
  async (_req, { auth }) => {
    return NextResponse.json({ rules: await listAlertRules(auth) });
  },
  { permission: "platform.admin" },
);

const patchSchema = z.object({
  ruleId: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  enabled: z.boolean().optional(),
  threshold: z.record(z.unknown()).optional(),
  action: z.enum(["notify_operator", "email_tenant", "create_task"]).optional(),
});

export const PATCH = route(
  async (req: NextRequest, { auth }) => {
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid request", parsed.error.flatten());
    const { ruleId, ...patch } = parsed.data;
    await updateAlertRule(auth, ruleId, patch);
    return NextResponse.json({ ok: true });
  },
  { permission: "platform.admin" },
);
