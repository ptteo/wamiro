import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createRule, listRules } from "@/modules/automations/service";

export const GET = route(
  async (_req, { auth }) => NextResponse.json({ rules: await listRules(auth) }),
  { permission: "automations.manage" },
);

const emailSchema = z.string().email().max(200);

const createSchema = z.object({
  name: z.string().min(2).max(120),
  requestTypeId: z.string().uuid().nullish(),
  conditionField: z.string().max(60).nullish(),
  conditionOp: z.enum(["gt", "gte", "lt", "lte", "eq"]).optional(),
  conditionValue: z.number().nullish(),
  notifyEmails: z.array(emailSchema).min(1).max(10),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid rule", parsed.error.flatten());
    await createRule(auth, {
      name: parsed.data.name,
      requestTypeId: parsed.data.requestTypeId ?? null,
      conditionField: parsed.data.conditionField ?? null,
      conditionOp: parsed.data.conditionOp ?? null,
      conditionValue: parsed.data.conditionValue ?? null,
      notifyEmails: parsed.data.notifyEmails,
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  },
  { permission: "automations.manage" },
);
