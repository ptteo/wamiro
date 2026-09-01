import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";

import { route } from "@/lib/api";
import { db } from "@/lib/db";
import { notifications } from "@/db/schema";

export const GET = route(
  async (_req, { auth }) => {
    const rows = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        title: notifications.title,
        body: notifications.body,
        link: notifications.link,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(eq(notifications.userId, auth.user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    return NextResponse.json({ notifications: rows });
  },
  { auth: true },
);
