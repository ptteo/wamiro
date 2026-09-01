import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { createType, listTypesForAdmin } from "@/modules/requests/service";

export const GET = route(
  async (_req, { auth }) => {
    return NextResponse.json({ types: await listTypesForAdmin(auth) });
  },
  { permission: "requests.manage" },
);

const fieldSchema = z.object({
  key: z.string().max(40).optional(),
  label: z.string().min(1).max(80),
  type: z.enum(["text", "textarea", "number", "date", "select"]),
  required: z.boolean().optional(),
  options: z.array(z.string().max(60)).max(12).optional(),
});

const createSchema = z.object({
  key: z.string().max(40).optional(),
  name: z.string().min(2).max(80),
  description: z.string().max(300).nullish(),
  fields: z.array(fieldSchema).min(1).max(12),
  approverMode: z.enum(["manager", "company"]).optional(),
  steps: z.array(z.object({ label: z.string().min(1).max(80), approverMode: z.enum(["manager", "company"]) })).max(5).optional(),
  slaHours: z.number().int().min(1).max(2160).optional(),
});

export const POST = route(
  async (req: NextRequest, { auth }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid request type", parsed.error.flatten());
    const row = await createType(auth, {
      key: parsed.data.key,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      fields: parsed.data.fields,
      approverMode: parsed.data.approverMode,
      steps: parsed.data.steps,
      slaHours: parsed.data.slaHours ?? null,
    });
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
  },
  { permission: "requests.manage" },
);
