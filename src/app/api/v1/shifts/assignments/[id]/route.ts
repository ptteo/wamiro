import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { removeAssignment } from "@/modules/shifts/service";

export const DELETE = route(async (_req, { auth, params }) => {
  await removeAssignment(auth, params["id"] ?? "");
  return NextResponse.json({ ok: true });
});
