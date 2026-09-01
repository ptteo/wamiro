import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import {
  decideJobChange,
  decideProfileChange,
  listJobChanges,
  listProfileChanges,
  requestJobChange,
  requestProfileChange,
} from "@/modules/people-ops/service";

export const GET = route(
  async (_req: NextRequest, { auth }) => {
    return NextResponse.json({
      jobChanges: await listJobChanges(auth),
      profileChanges: await listProfileChanges(auth),
    });
  },
  { auth: true },
);

const profileSchema = z.object({
  type: z.literal("profile"),
  fieldKey: z.string().max(40),
  requestedValue: z.string().min(1).max(2000),
});

const jobSchema = z.object({
  type: z.literal("job"),
  userId: z.string().uuid(),
  kind: z.string().max(30),
  newValue: z.record(z.unknown()),
  oldValue: z.record(z.unknown()).optional(),
  effectiveAt: z.string().max(10).optional(),
  note: z.string().max(2000).optional(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const body = await req.json().catch(() => null);
    if (body?.type === "profile") {
      const parsed = profileSchema.safeParse(body);
      if (!parsed.success) throw ApiError.badRequest("Check the form", parsed.error.flatten());
      await requestProfileChange(auth, parsed.data);
    } else {
      const parsed = jobSchema.safeParse(body);
      if (!parsed.success) throw ApiError.badRequest("Check the form", parsed.error.flatten());
      await requestJobChange(auth, {
        userId: parsed.data.userId,
        kind: parsed.data.kind,
        newValue: parsed.data.newValue,
        oldValue: parsed.data.oldValue,
        effectiveAt: parsed.data.effectiveAt,
        note: parsed.data.note,
      });
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  },
  { auth: true },
);

const decideSchema = z.object({
  changeType: z.enum(["profile", "job"]),
  id: z.string().uuid(),
  action: z.enum(["approve", "reject", "apply"]),
});

export const PATCH = route(
  async (req: NextRequest, { auth }) => {
    const parsed = decideSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid payload");
    if (parsed.data.changeType === "profile") {
      await decideProfileChange(auth, parsed.data.id, parsed.data.action === "approve");
    } else {
      if (!["approve", "apply", "reject"].includes(parsed.data.action)) throw ApiError.badRequest("Invalid action");
      await decideJobChange(auth, parsed.data.id, parsed.data.action);
    }
    return NextResponse.json({ ok: true });
  },
  { auth: true },
);
