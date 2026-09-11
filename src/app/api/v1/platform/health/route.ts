import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { healthBoard } from "@/modules/platform/health";
import { alertInbox } from "@/modules/platform/alerts";

/** Phase D — red/yellow/green health board + alert inbox (one read). */
export const GET = route(
  async (_req, { auth }) => {
    const [board, alerts] = await Promise.all([healthBoard(auth), alertInbox(auth, "open")]);
    return NextResponse.json({ board, alerts });
  },
  { permission: "platform.admin" },
);
