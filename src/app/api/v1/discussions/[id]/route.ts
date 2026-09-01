import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { getDiscussion } from "@/modules/discussions/service";

export const GET = route(async (_req: NextRequest, { auth, params }) => {
  const id = params["id"] ?? "";
  return NextResponse.json(await getDiscussion(auth, id));
});
