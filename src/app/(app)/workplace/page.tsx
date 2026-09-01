export const dynamic = "force-dynamic";

import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";
import {
  listResources,
  myBookings,
  myVisitors,
  orgBookingsOn,
} from "@/modules/workplace/service";
import { WorkplaceClient } from "@/components/workplace-client";
import { Card, EmptyState } from "@/components/ui";

export const metadata = { title: "Workplace" };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function WorkplacePage() {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "workplace") || !can(ctx.access, "workplace.view")) {
    return <Card><EmptyState title="Workplace" hint="You don't have workplace access." /></Card>;
  }

  const day = todayIso();
  const [resources, bookings, visitors, orgToday] = await Promise.all([
    listResources(ctx),
    myBookings(ctx),
    myVisitors(ctx),
    orgBookingsOn(ctx, day),
  ]);

  return (
    <WorkplaceClient
      resources={resources.map((r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind ?? "room",
        location: r.location ?? null,
        capacity: r.capacity ?? null,
        features: r.features ?? [],
        status: r.status ?? "active",
      }))}
      bookings={bookings.map((b) => ({
        id: b.id,
        resourceId: b.resourceId,
        resourceName: b.resourceName,
        startsAt: b.startsAt.toISOString(),
        endsAt: b.endsAt.toISOString(),
        status: b.status,
      }))}
      visitors={visitors.map((v) => ({
        id: v.id,
        name: v.name,
        email: v.email ?? null,
        visitDate: typeof v.visitDate === "string" ? v.visitDate : new Date(v.visitDate).toISOString().slice(0, 10),
        status: v.status,
        hostUserId: v.hostUserId,
        hostName: v.hostName ?? null,
      }))}
      orgToday={orgToday.map((b) => ({
        id: b.id,
        resourceId: b.resourceId,
        resourceName: b.resourceName,
        userName: b.userName ?? null,
        startsAt: b.startsAt.toISOString(),
        endsAt: b.endsAt.toISOString(),
        status: b.status,
      }))}
      canBook={can(ctx.access, "workplace.book")}
      canManage={can(ctx.access, "workplace.manage")}
      day={day}
    />
  );
}
