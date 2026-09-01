import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { listDirectory } from "@/modules/people/service";

export const GET = route(async (_req, { auth }) => {
  return NextResponse.json({ people: await listDirectory(auth) });
});
