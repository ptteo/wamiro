import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { requireAuthPage } from "@/lib/page-auth";
import { employees } from "@/db/schema";
import { listDefs } from "@/modules/people/customfields";
import {
  directReports,
  employeeWorkspaceData,
  getProfileById,
  managesUser,
} from "@/modules/people/service";
import { lifecycleTimeline } from "@/modules/people-ops/service";
import { can, widestScope } from "@/modules/iam/engine";
import { ProfilePageClient } from "@/components/people-profile";

export const metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

const TABS = ["overview", "attendance", "leave"] as const;
type TabKey = (typeof TABS)[number];

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await requireAuthPage();
  const { id } = await params;
  const sp = await searchParams;

  const scope = widestScope(ctx.access, "employees.view");
  const isSelf = ctx.user.id === id;
  const companyWide = scope === "COMPANY" || scope === "GLOBAL";

  if (!companyWide && !isSelf) {
    if (!can(ctx.access, "employees.view") || !(await managesUser(ctx.user.id, id))) {
      notFound();
    }
  }

  const profile = await getProfileById(ctx, id);
  if (!profile) notFound();

  const isManagerOf = await managesUser(ctx.user.id, id);
  const canSeeExtras = ctx.user.id === id || isManagerOf || can(ctx.access, "employees.edit");
  const canSendKudos = can(ctx.access, "recognition.give");
  const canEditFields = can(ctx.access, "employees.edit");

  const [reports, timeline, defs, empRow, workspace] = await Promise.all([
    canSeeExtras ? directReports(ctx, id).catch(() => []) : Promise.resolve([]),
    canSeeExtras
      ? lifecycleTimeline(ctx, id).catch(() => ({ jobTitle: null, events: [] as never[] }))
      : Promise.resolve({ jobTitle: null, events: [] as never[] }),
    listDefs(ctx),
    db
      .select({ cf: employees.customFields })
      .from(employees)
      .where(and(eq(employees.userId, id), eq(employees.organizationId, ctx.user.organizationId)))
      .limit(1),
    employeeWorkspaceData(ctx, id).catch(() => null),
  ]);

  const activeDefs = defs.filter((d) => d.active).map((d) => ({ ...d }));
  const customValues = (empRow[0]?.cf ?? {}) as Record<string, unknown>;
  const initialTab: TabKey = (TABS as readonly string[]).includes(sp.tab ?? "")
    ? (sp.tab as TabKey)
    : "overview";

  return (
    <ProfilePageClient
      profile={{
        userId: profile.userId,
        name: profile.name,
        email: profile.email,
        status: profile.status,
        avatarUrl: profile.avatarUrl,
        jobTitle: profile.jobTitle,
        departmentId: profile.departmentId,
        departmentName: profile.departmentName,
        managerId: profile.managerId,
        managerName: profile.managerName,
        hiredAt: profile.hiredAt,
      }}
      reports={reports as never}
      timeline={timeline as never}
      workspace={workspace}
      customDefs={activeDefs as never}
      customValues={customValues}
      canEditFields={canEditFields}
      canSeeExtras={canSeeExtras}
      canSendKudos={canSendKudos}
      initialTab={initialTab}
    />
  );
}
