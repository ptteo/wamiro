import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { orgStorageUsage } from "@/modules/storage/service";

/** Tenant admin: this org's object-storage usage, grouped by category. */
export const GET = route(async (_req, { auth }) => {
  return NextResponse.json(await orgStorageUsage(auth));
});