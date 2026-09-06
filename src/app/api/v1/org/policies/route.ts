import { NextResponse, type NextRequest } from "next/server";

import { route } from "@/lib/api";
import { getPolicies, updatePolicies } from "@/modules/org/policies";

export const GET = route(async (_req, { auth }) => {
  return NextResponse.json(await getPolicies(auth));
});

export const PATCH = route(async (req: NextRequest, { auth }) => {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  return NextResponse.json(await updatePolicies(auth, body ?? {}));
});
