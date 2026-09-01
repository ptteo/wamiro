import { Content, PageHeader } from "@/components/page-header";
import { AttendanceClient, type MyAttendanceData } from "@/components/attendance-client";
import { Card, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { myAttendanceSummary, progressOfToday } from "@/modules/attendance/service";
import { can } from "@/modules/iam/engine";

export const dynamic = "force-dynamic";
export const metadata = { title: "Attendance" };

export default async function AttendancePage() {
  const ctx = await requireAuthPage();
  if (!can(ctx.access, "attendance.view_self")) {
    return (
      <Content>
        <Card>
          <EmptyState
            title="Attendance unavailable"
            hint="You don't have access to the attendance module."
          />
        </Card>
      </Content>
    );
  }

  const s = await myAttendanceSummary(ctx);

  // 8h target for the progress bar
  const progress = progressOfToday(s.todayMinutes);

  const data: MyAttendanceData = {
    open: s.open
      ? {
          id: s.open.id,
          clockIn: s.open.clockIn.toISOString(),
        }
      : null,
    todayMinutes: s.todayMinutes,
    weekMinutes: s.weekMinutes,
    daysWorkedThisWeek: s.daysWorkedThisWeek,
    week: s.week,
    history: s.history.map((r) => ({
      id: `${r.userId}:${r.date}`,
      userId: r.userId,
      userName: r.userName,
      date: r.date,
      clockIn: r.clockIn.toISOString(),
      clockOut: r.clockOut ? r.clockOut.toISOString() : null,
      minutes: r.minutes,
    })),
    teamNow: s.teamNow.map((t) => ({
      userId: t.userId,
      userName: t.userName,
      clockIn: t.clockIn.toISOString(),
      minutes: t.minutes,
    })),
    orgClockedInNow: s.orgClockedInNow,
  };

  return (
    <Content width="wide">
      <PageHeader
        title="Attendance"
        subtitle="Track your hours, see your week at a glance, and check on your team."
      />
      <AttendanceClient data={data} progress={progress} />
    </Content>
  );
}
