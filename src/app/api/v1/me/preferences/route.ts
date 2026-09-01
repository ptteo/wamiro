import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { deletePreference, getMergedPreferences, setPreference } from "@/modules/prefs/service";

/** Merged view for the ACTIVE tenant (tenant-scoped overrides global). */
export const GET = route(
  async (_req: NextRequest, { auth }) => {
    return NextResponse.json({
      preferences: await getMergedPreferences(auth.user.id, auth.user.organizationId),
    });
  },
  { auth: true },
);

const schema = z.object({
  key: z.string().min(1).max(60),
  value: z.unknown(),
  orgScoped: z.boolean().optional(),
  delete: z.boolean().optional(),
});

export const PUT = route(
  async (req: NextRequest, { auth }) => {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid payload", parsed.error.flatten());
    const { key, value, orgScoped, delete: del } = parsed.data;
    if (del) {
      await deletePreference(auth.user.id, key, orgScoped ? auth.user.organizationId : null);
      return NextResponse.json({ ok: true });
    }
    await setPreference(auth, { key, value, orgScoped });
    return NextResponse.json({ ok: true }, { status: 201 });
  },
  { auth: true },
);
