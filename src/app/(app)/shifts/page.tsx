import { Content, PageHeader } from "@/components/page-header";
import { Card, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { listMembers, listShiftTypes, myShifts } from "@/modules/shifts/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shifts" };

export default async function ShiftsPage() {
  const ctx = await requireAuthPage();
  if (!can(ctx.access, "shifts.view")) {
    return (
      <Content>
        <Card>
          <EmptyState title="Shifts unavailable" hint="You don't have access to shift scheduling." />
        </Card>
      </Content>
    );
  }

  const canManage = can(ctx.access, "shifts.manage");
  const [mine, types, members] = await Promise.all([
    myShifts(ctx, 28),
    canManage ? listShiftTypes(ctx) : Promise.resolve([]),
    canManage ? listMembers(ctx) : Promise.resolve([]),
  ]);

  const data = {
    canManage,
    shifts: mine.map((s) => ({
      id: s.id,
      date: String(s.date),
      name: s.name,
      startMinutes: s.startMinutes,
      endMinutes: s.endMinutes,
      graceMinutes: s.graceMinutes,
      color: s.color,
    })),
    types: types.map((t) => ({
      id: t.id,
      name: t.name,
      startMinutes: t.startMinutes,
      endMinutes: t.endMinutes,
      graceMinutes: t.graceMinutes,
      workingHours: Number(t.workingHours),
      color: t.color,
    })),
    members: members.map((m) => ({ id: m.id, name: m.name })),
  };

  const { ShiftsClient } = await import("@/components/shifts-client");

  return (
    <Content width="wide">
      <PageHeader
        title="Shifts"
        subtitle="Your schedule at a glance — and, for HR, the team roster."
      />
      <ShiftsClient data={data} />
    </Content>
  );
}
