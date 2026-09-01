export const dynamic = "force-dynamic";

import { Card, EmptyState } from "@/components/ui";
import { CalendarListClient, type CalendarDayEvent, type CalendarLeaveRow, type CalendarMonthData } from "@/components/calendar-list";
import { Content, PageHeader } from "@/components/page-header";
import { requireAuthPage } from "@/lib/page-auth";
import { can, widestScope } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";
import {
  listHolidays,
  listHolidaysInYear,
  viewerOwnLeave,
  visibleLeaveInMonth,
} from "@/modules/calendar/service";
import { teamOutNextWeeks } from "@/modules/leave/service";

export const metadata = { title: "Calendar" };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "calendar")) {
    return (
      <Content width="standard">
        <Card>
          <EmptyState title="Calendar unavailable" hint="This module is disabled for your organization." />
        </Card>
      </Content>
    );
  }

  const sp = await searchParams;
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const year = Number(sp.month?.slice(0, 4)) || now.getFullYear();
  const month = Number(sp.month?.slice(5, 7)) || now.getMonth() + 1; // 1-12
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;

  const canSeeOthers = !!widestScope(ctx.access, "leave.view");
  const canManageHolidays = can(ctx.access, "settings.manage");

  const [holidays, yearHolidays, leave, myLeave, teamOutNext] = await Promise.all([
    listHolidays(ctx),
    listHolidaysInYear(ctx, year),
    canSeeOthers ? visibleLeaveInMonth(ctx, monthStart, monthEnd) : Promise.resolve([]),
    viewerOwnLeave(ctx, monthStart, monthEnd),
    canSeeOthers ? teamOutNextWeeks(ctx, 8) : Promise.resolve([]),
  ]);

  // expand approved leave into per-day entries
  const leaveByDay = new Map<string, CalendarLeaveRow[]>();
  const addPerson = (dateKey: string, row: CalendarLeaveRow) => {
    const arr = leaveByDay.get(dateKey) ?? [];
    if (!arr.some((p) => p.userId === row.userId && p.userName === row.userName)) {
      arr.push(row);
      leaveByDay.set(dateKey, arr);
    }
  };
  for (const l of leave) {
    let d = new Date(`${l.startDate}T00:00:00Z`);
    const end = new Date(`${l.endDate}T00:00:00Z`);
    while (d <= end) {
      const key = d.toISOString().slice(0, 10);
      if (key >= monthStart && key <= monthEnd) addPerson(key, l);
      d = new Date(+d + 86_400_000);
    }
  }

  // build the grid: leading blanks so day 1 lands on the right weekday (Mon-start)
  const first = new Date(`${monthStart}T00:00:00Z`);
  const leadBlanks = (first.getUTCDay() + 6) % 7;
  const days: CalendarDayEvent[] = Array.from({ length: lastDay }, (_, i) => {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
    const people = (leaveByDay.get(dateStr) ?? []).slice().sort((a, b) => {
      // self first, then by name
      if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
      return a.userName.localeCompare(b.userName);
    });
    return {
      date: dateStr,
      holiday: holidays.find((h) => h.date === dateStr) ?? null,
      people,
    };
  });

  // Project teamOutNext (per-request rows) into per-day summaries
  const teamOutByDay = new Map<string, string[]>();
  for (const l of teamOutNext) {
    let d = new Date(`${l.startDate}T00:00:00Z`);
    const end = new Date(`${l.endDate}T00:00:00Z`);
    while (d <= end) {
      const key = d.toISOString().slice(0, 10);
      if (key >= todayIso) {
        const arr = teamOutByDay.get(key) ?? [];
        if (!arr.includes(l.userName)) arr.push(l.userName);
        teamOutByDay.set(key, arr);
      }
      d = new Date(+d + 86_400_000);
    }
  }
  const teamOutNextProjected = Array.from(teamOutByDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 28) // 8 weeks * 7 days cap
    .map(([date, people]) => ({ date, people }));

  const monthLabel = (() => {
    const n = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ][month - 1];
    return `${n} ${year}`;
  })();

  const data: CalendarMonthData = {
    year,
    month,
    monthLabel,
    days,
    leadBlanks,
    canManageHolidays,
    yearHolidays,
    myLeave,
    teamOutNext: teamOutNextProjected,
    todayIso,
  };

  return (
    <Content width="wide">
      <PageHeader
        title="Calendar"
        subtitle="Holidays, your time off, and approved leave across the team."
      />
      <CalendarListClient data={data} />
    </Content>
  );
}
