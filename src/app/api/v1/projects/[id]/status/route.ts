import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { setProjectStatus } from "@/modules/work/service";

const bodySchema = z.object({
  status: z.enum(["active", "completed", "archived"]),
});

export const PATCH = route(async (req: NextRequest, { auth, params }) => {
  const id = params["id"];
  if (!id) throw new Error("Project id required");
  const body = bodySchema.parse(await req.json().catch(() => ({})));
  await setProjectStatus(auth, id, body.status);
  return NextResponse.json({ ok: true });
});
