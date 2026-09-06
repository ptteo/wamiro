import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { fleetStorage } from "@/modules/storage/service";

/** Platform console: fleet-wide object-storage usage (platform.admin only). */
export const GET = route(async (_req, { auth }) => {
  return NextResponse.json(await fleetStorage(auth));
});