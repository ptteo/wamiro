import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { setFieldValue } from "@/modules/people/customfields";

const bodySchema = z.object({
  key: z.string().min(1).max(40),
  value: z.string().max(500).nullable(),
});

/** Set one custom field value on an employee. */
export const PATCH = route(
  async (req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Employee id required");
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("key and value required", parsed.error.flatten());
    await setFieldValue(auth, id, parsed.data.key, parsed.data.value);
    return NextResponse.json({ ok: true });
  },
  { permission: "employees.edit" },
);
