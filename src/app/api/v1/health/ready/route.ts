import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { pingDb } from "@/lib/session";

/** Readiness: dependencies reachable. 503 when the DB is down. */
export const GET = route(
  async () => {
    const db = await pingDb();
    return NextResponse.json({ ok: db, db }, { status: db ? 200 : 503 });
  },
  { auth: false },
);
