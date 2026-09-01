import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { withdraw } from "@/modules/requests/service";

export const POST = route(async (_req: NextRequest, { auth, params }) => {
  const id = params["id"];
  if (!id) throw ApiError.badRequest("Request id required");
  await withdraw(auth, id);
  return NextResponse.json({ ok: true });
});
