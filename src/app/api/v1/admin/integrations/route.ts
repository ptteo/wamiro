import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { registryStatus } from "@/lib/providers/registry";

/** R7 §5 — integration status surface for admins (booleans only, no secrets). */
export const GET = route(
  async (_req, { auth }) => {
    return NextResponse.json({ providers: registryStatus() });
  },
  { permission: "settings.manage" },
);
