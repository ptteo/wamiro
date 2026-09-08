import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { listJobLedger } from "@/modules/platform/jobs";

export const GET = route(
  async (_req, { auth }) => NextResponse.json({ jobs: await listJobLedger(auth) }),
  { permission: "platform.admin" },
);
