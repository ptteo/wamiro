import { NextResponse } from "next/server";

import { route } from "@/lib/api";

/** Identity + effective permissions for the current session. */
export const GET = route(async (_req, { auth }) => {
  return NextResponse.json({
    user: auth.user,
    organization: auth.org,
    roles: auth.roleKeys,
    permissions: Array.from(auth.access.allowed.entries()).map(
      ([permission, scope]) => ({ permission, scope }),
    ),
    denied: Array.from(auth.access.denied),
  });
});
