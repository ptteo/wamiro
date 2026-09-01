import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { readLogo } from "@/modules/org/branding";

/**
 * Serve the caller's tenant logo. Same-origin <img> requests carry the
 * session cookie, so tenant isolation holds without extra parameters.
 */
export const GET = route(async (_req, { auth }) => {
  const logo = await readLogo(auth.user.organizationId);
  if (!logo) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
  return new NextResponse(new Uint8Array(logo.data), {
    headers: {
      "Content-Type": logo.contentType,
      "Cache-Control": "private, max-age=300",
    },
  });
});
