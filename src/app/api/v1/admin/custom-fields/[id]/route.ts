import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { deactivateDef } from "@/modules/people/customfields";

export const DELETE = route(
  async (_req: NextRequest, { auth, params }) => {
    const id = params["id"];
    if (!id) throw ApiError.badRequest("Field id required");
    await deactivateDef(auth, id);
    return NextResponse.json({ ok: true });
  },
  { permission: "employees.edit" },
);
