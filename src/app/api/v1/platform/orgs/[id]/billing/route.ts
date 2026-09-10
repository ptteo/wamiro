import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { setOrgPlan, startTrial } from "@/modules/billing/service";
import { requestOrExecuteCancel } from "@/modules/platform/destructive-ops";

const patchSchema = z
  .object({
    plan: z.enum(["starter", "growth", "scale"]).optional(),
    billingStatus: z.enum(["trial", "active", "past_due", "cancelled"]).optional(),
    trialDays: z.number().int().min(1).max(365).nullable().optional(),
    seatLimit: z.number().int().min(1).max(1_000_000).nullable().optional(),
    seatOveragePolicy: z.enum(["hard", "soft"]).optional(),
    reason: z.string().max(500).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Provide plan, billingStatus, trialDays, seatLimit or seatOveragePolicy",
  });

/** Platform operators manage a tenant's subscription. */
export const PATCH = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Organization id required");
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid subscription update", parsed.error.flatten());

    // Phase B-fix: cancelling a PAYING tenant requires a second operator.
    if (parsed.data.billingStatus === "cancelled") {
      const result = await requestOrExecuteCancel(
        auth,
        id,
        parsed.data.reason?.trim() || "cancelled via subscription update",
      );
      return NextResponse.json(result);
    }
    await setOrgPlan(auth, id, parsed.data as Parameters<typeof setOrgPlan>[2]);
    return NextResponse.json({ ok: true });
  },
  { permission: "platform.admin" },
);

/** Grant a free trial of a paid plan (default: Growth, 14 days). */
export const POST = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Organization id required");
    const body = ((await req.json().catch(() => null)) ?? {}) as { plan?: string };
    const plan = body.plan === "scale" ? "scale" : "growth";
    await startTrial(auth, id, plan);
    return NextResponse.json({ ok: true });
  },
  { permission: "platform.admin" },
);

/** Hard-stop a tenant (cancel subscription) or lift the stop. Two-person rule applies to paying tenants. */
export const DELETE = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Organization id required");
    const body = ((await req.json().catch(() => null)) ?? {}) as { reason?: string };
    const result = await requestOrExecuteCancel(
      auth,
      id,
      body.reason?.trim() || "cancelled from the platform console",
    );
    return NextResponse.json(result);
  },
  { permission: "platform.admin" },
);
