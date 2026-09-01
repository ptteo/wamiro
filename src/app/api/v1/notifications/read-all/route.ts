import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { listMine, markAllRead, unreadCount } from "@/modules/notifications/service";

export const GET = route(async (_req, { auth }) => {
  const [items, unread] = await Promise.all([listMine(auth), unreadCount(auth)]);
  return NextResponse.json({ notifications: items, unread });
});

export const POST = route(async (_req, { auth }) => {
  await markAllRead(auth);
  return NextResponse.json({ ok: true });
});
