import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { remove } from "@/modules/documents/service";

export const DELETE = route(async (_req: NextRequest, { auth, params }) => {
  const id = params["id"];
  if (!id) throw ApiError.badRequest("Document id required");
  await remove(auth, id);
  return NextResponse.json({ ok: true });
});
