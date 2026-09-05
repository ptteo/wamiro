import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { remove } from "@/modules/people/hr-documents";

export const DELETE = route(async (_req, { auth, params }) => {
  await remove(auth, params["id"] ?? "");
  return NextResponse.json({ ok: true });
});
