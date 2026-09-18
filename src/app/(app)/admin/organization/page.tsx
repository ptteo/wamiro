export const dynamic = "force-dynamic";

import { adminTabsFor } from "@/lib/admin-nav";
import { AdminNav, AdminSection } from "@/components/admin-ui";
import { Card, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { DepartmentsClient } from "@/components/departments-client";
import { requireAuthPage } from "@/lib/page-auth";
import { listDepartments } from "@/modules/org/service";
import { can } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";

export const metadata = { title: "Organization" };

const DATASETS: { key: string; label: string; description: string }[] = [
  { key: "employees", label: "Employees", description: "Directory with department and status." },
  { key: "attendance", label: "Attendance", description: "Daily clock-in / clock-out records." },
  { key: "leave", label: "Leave", description: "Leave requests and their decisions." },
  { key: "audit", label: "Audit", description: "Full administrative audit trail." },
  { key: "hr-headcount", label: "HR · Headcount", description: "Headcount movement over time." },
  { key: "hr-attrition", label: "HR · Attrition", description: "Leavers by period and department." },
  { key: "hr-leave", label: "HR · Leave", description: "Leave balances and usage." },
  { key: "hr-payroll", label: "HR · Payroll", description: "Payroll run summaries." },
  { key: "support-tickets", label: "Support · Tickets", description: "Ticket volume and outcomes." },
  { key: "support-sla", label: "Support · SLA", description: "First-response and resolution SLAs." },
  { key: "support-csat", label: "Support · CSAT", description: "Customer satisfaction responses." },
];

export default async function AdminOrganizationPage() {
  const ctx = await requireAuthPage();
  const canExport = can(ctx.access, "data.export");
  const canManageDepts = can(ctx.access, "departments.manage");
  const canAudit = can(ctx.access, "audit.view");

  if (!isModuleEnabled(ctx.org.modules, "admin") || (!canExport && !canManageDepts && !canAudit)) {
    return (
      <>
        <PageHeader title="Organization" />
        <Card>
          <EmptyState
            title="Organization"
            hint="You don't have permission to view organization settings."
          />
        </Card>
      </>
    );
  }

  const tabs = adminTabsFor(
    (p) => can(ctx.access, p),
    ctx.org.modules
  );

  const departments = await listDepartments(ctx);

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Organization"
        subtitle={`Structure and data of ${ctx.org.name}.`}
      />

      <AdminNav items={tabs} />

      <AdminSection
        title="Departments"
        subtitle={`${departments.length} defined`}
      >
        <DepartmentsClient
          departments={departments.map((d) => ({
            id: d.id,
            name: d.name,
            managerName: d.managerName,
            memberCount: Number(d.memberCount),
          }))}
          canManage={canManageDepts}
        />
      </AdminSection>

      {canExport ? (
        <AdminSection title="Data export" subtitle="CSV downloads · every export is audited" tone="brand">
          <ul className="divide-y divide-border-subtle">
            {DATASETS.map((d) => (
              <li
                key={d.key}
                className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium text-primary">{d.label}</p>
                  <p className="text-xs text-tertiary">{d.description}</p>
                </div>
                <a
                  href={`/api/v1/admin/export/${d.key}`}
                  className="shrink-0 text-sm font-medium text-brand-text hover:underline"
                >
                  Download CSV →
                </a>
              </li>
            ))}
          </ul>
        </AdminSection>
      ) : null}

      {canAudit && !canExport ? (
        <AdminSection title="Data export" subtitle="Requires the data.export permission">
          <p className="py-4 text-sm text-tertiary">
            You can view the audit trail but not export company datasets. Ask an administrator for
            the data.export permission.
          </p>
        </AdminSection>
      ) : null}
    </div>
  );
}
