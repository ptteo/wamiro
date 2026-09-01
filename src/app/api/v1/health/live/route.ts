import { NextResponse } from "next/server";

import { route } from "@/lib/api";

/** Liveness: process is up. No dependencies checked — for orchestrators. */
export const GET = route(
  async () => NextResponse.json({ ok: true }),
  { auth: false },
);
