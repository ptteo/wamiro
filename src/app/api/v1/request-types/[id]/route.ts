import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { deactivateType, updateType } from "@/modules/requests/service";

const stepSchema = z.object({
  label: z.string().min(1).max(80),
  approverMode: z.enum(["manager", "company"]),
});

const updateSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(300).nullish(),
  fields: z
    .array(
      z.object({
        key: z.string().max(40).optional(),
        label: z.string().min(1).max(80),
        type: z.enum(["text", "textarea", "number", "date", "select"]),
        required: z.boolean().optional(),
        options: z.array(z.string().max(60)).max(12).optional(),
      }),
    )
    .min(1)
    .max(12),
  approverMode: z.enum(["manager", "company"]).optional(),
  steps: z.array(stepSchema).max(5).optional(),
});

export const PUT = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Request-type id required");
    const parsed = updateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid request type", parsed.error.flatten());
    await updateType(auth, id, {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      fields: parsed.data.fields,
      approverMode: parsed.data.approverMode,
      // forward steps — omitting them would wipe the stored approval chain
      steps: parsed.data.steps,
    });
    return NextResponse.json({ ok: true });
  },
  { permission: "requests.manage" },
);

export const DELETE = route(
  async (_req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Request-type id required");
    await deactivateType(auth, id);
    return NextResponse.json({ ok: true });
  },
  { permission: "requests.manage" },
);
