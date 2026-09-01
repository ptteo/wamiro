import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { search } from "@/modules/search/service";

export const GET = route(async (req: NextRequest, { auth }) => {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  return NextResponse.json({ results: await search(auth, q) });
});
