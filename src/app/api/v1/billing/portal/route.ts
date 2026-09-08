import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { startPortal } from "@/modules/billing/service";

export const POST = route(
  async (_req, { auth }) => NextResponse.json(await startPortal(auth)),
  { permission: "settings.manage" },
);
