import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { removeLogo, saveLogo } from "@/modules/org/branding";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Upload/replace the tenant logo. */
export const POST = route(
  async (req: NextRequest, { auth }) => {
    const form = await req.formData().catch(() => null);
    if (!form) throw ApiError.badRequest("multipart/form-data body expected");
    const file = form.get("logo");
    if (!(file instanceof File)) throw ApiError.badRequest("logo field required");
    if (file.size > MAX_LOGO_BYTES) throw ApiError.badRequest("Logo must be under 2 MB");

    const data = Buffer.from(await file.arrayBuffer());
    await saveLogo(auth.user.organizationId, file.type || "image/png", data);
    return NextResponse.json({ ok: true }, { status: 201 });
  },
  { permission: "settings.manage" },
);

/** Remove the logo (back to the initial-letter avatar). */
export const DELETE = route(
  async (_req: NextRequest, { auth }) => {
    await removeLogo(auth.user.organizationId);
    return NextResponse.json({ ok: true });
  },
  { permission: "settings.manage" },
);
