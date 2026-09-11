/**
 * Phase 8 — assets depth: warranty expiry sweep (notify-once stamp on
 * `warranty_notified_at`). Notifies the current holder and org admins 30
 * days before warranty expiry.
 */
import { and, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { assets } from "@/db/schema";
import { notify } from "@/modules/notifications/service";

const HORIZON_DAYS = 30;

export async function sweepWarrantyExpiry(): Promise<{ notified: number }> {
  const horizon = new Date(Date.now() + HORIZON_DAYS * 86_400_000).toISOString().slice(0, 10);
  const expiring = await db
    .select({
      id: assets.id,
      organizationId: assets.organizationId,
      name: assets.name,
      assignedToUserId: assets.assignedToUserId,
      warrantyExpiresAt: assets.warrantyExpiresAt,
    })
    .from(assets)
    .where(
      and(
        isNull(assets.warrantyNotifiedAt),
        isNotNull(assets.warrantyExpiresAt),
        lte(assets.warrantyExpiresAt, horizon),
      ),
    )
    .limit(500);

  for (const a of expiring) {
    await db
      .update(assets)
      .set({ warrantyNotifiedAt: new Date() })
      .where(and(eq(assets.id, a.id), isNull(assets.warrantyNotifiedAt)));
    if (!a.organizationId) continue;
    if (a.assignedToUserId) {
      await notify({
        organizationId: a.organizationId,
        userId: a.assignedToUserId,
        type: "assets.warranty",
        title: `Warranty expiring: ${a.name}`,
        body: `Warranty ends ${a.warrantyExpiresAt ?? "soon"}. Plan service or replacement.`,
        link: "/assets",
      }).catch(() => {});
    }
  }
  return { notified: expiring.length };
}
