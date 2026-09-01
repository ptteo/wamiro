/**
 * Asset inventory (GLPI-lite, blueprint Â§30): HR/Admin track hardware and
 * assign it to people. Employees see what's assigned to them.
 */
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/lib/session";
import { notify } from "@/modules/notifications/service";
import { assets, users } from "@/db/schema";
import { can } from "@/modules/iam/engine";

const CATEGORIES = new Set(["laptop", "phone", "monitor", "other"]);

export async function listMine(ctx: AuthContext) {
  return db
    .select({
      id: assets.id,
      name: assets.name,
      category: assets.category,
      serialNumber: assets.serialNumber,
      notes: assets.notes,
      assignedToName: users.name,
      assignedToAvatar: users.avatarUrl,
      createdAt: assets.createdAt,
    })
    .from(assets)
    .leftJoin(users, eq(users.id, assets.assignedToUserId))
    .where(
      and(
        eq(assets.organizationId, ctx.user.organizationId),
        eq(assets.assignedToUserId, ctx.user.id),
      ),
    )
    .orderBy(asc(assets.name));
}

export async function listAll(ctx: AuthContext) {
  if (!can(ctx.access, "assets.manage")) {
    throw ApiError.forbidden("Missing permission: assets.manage");
  }
  return db
    .select({
      id: assets.id,
      name: assets.name,
      category: assets.category,
      serialNumber: assets.serialNumber,
      notes: assets.notes,
      assignedToName: users.name,
      assignedToUserId: assets.assignedToUserId,
      assignedToAvatar: users.avatarUrl,
      createdAt: assets.createdAt,
    })
    .from(assets)
    .leftJoin(users, eq(users.id, assets.assignedToUserId))
    .where(eq(assets.organizationId, ctx.user.organizationId))
    .orderBy(asc(assets.name));
}

export async function createAsset(
  ctx: AuthContext,
  input: { name: string; category?: string; serialNumber?: string | null },
) {
  if (!can(ctx.access, "assets.manage")) {
    throw ApiError.forbidden("Missing permission: assets.manage");
  }
  const inserted = await db
    .insert(assets)
    .values({
      organizationId: ctx.user.organizationId,
      name: input.name.trim().slice(0, 120),
      category: CATEGORIES.has(input.category ?? "") ? input.category! : "other",
      serialNumber: input.serialNumber?.trim().slice(0, 120) || null,
    })
    .returning({ id: assets.id });
  const row = inserted[0];
  if (!row) throw new Error("Insert returned no row");

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: "ASSET_CREATED",
    entityType: "asset",
    entityId: row.id,
    newValue: { name: input.name },
  });

  return row.id;
}

/** Assign to a member (or null to return to stock). Manage-only, audited, notifies. */
export async function assignAsset(
  ctx: AuthContext,
  assetId: string,
  targetUserEmail: string | null,
) {
  if (!can(ctx.access, "assets.manage")) {
    throw ApiError.forbidden("Missing permission: assets.manage");
  }
  const [asset] = await db
    .select({ id: assets.id, name: assets.name })
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.organizationId, ctx.user.organizationId)))
    .limit(1);
  if (!asset) throw ApiError.notFound();

  let assigneeId: string | null = null;
  let assigneeName = "";
  if (targetUserEmail) {
    const [user] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(
        and(
          eq(users.email, targetUserEmail.trim().toLowerCase()),
          eq(users.organizationId, ctx.user.organizationId),
        ),
      )
      .limit(1);
    if (!user) throw ApiError.notFound("No user with that email in your organization");
    assigneeId = user.id;
    assigneeName = user.name;
  }

  await db.update(assets).set({ assignedToUserId: assigneeId }).where(eq(assets.id, assetId));

  await audit({
    organizationId: ctx.user.organizationId,
    actorUserId: ctx.user.id,
    action: assigneeId ? "ASSET_ASSIGNED" : "ASSET_RETURNED",
    entityType: "asset",
    entityId: assetId,
    newValue: { asset: asset.name, assignee: assigneeName || null },
  });

  if (assigneeId) {
    await notify({
      organizationId: ctx.user.organizationId,
      userId: assigneeId,
      type: "asset.assigned",
      title: `${asset.name} was assigned to you`,
      link: "/assets",
    });
  }
}
