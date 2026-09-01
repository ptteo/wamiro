import { Content, PageHeader } from "@/components/page-header";
import {
  PeopleDirectory,
  PeopleDirectoryHeaderAction,
} from "@/components/people-directory";
import { Card, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { listDirectory } from "@/modules/people/service";
import { listDepartments } from "@/modules/org/service";
import { can, widestScope } from "@/modules/iam/engine";

export const dynamic = "force-dynamic";

export const metadata = { title: "People" };

const STATUSES = ["active", "invited", "suspended"] as const;
type StatusKey = (typeof STATUSES)[number];

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dept?: string; status?: string }>;
}) {
  const ctx = await requireAuthPage();
  if (!can(ctx.access, "employees.view")) {
    return (
      <Content>
        <Card>
          <EmptyState title="Directory unavailable" hint="You don't have access to the people directory." />
        </Card>
      </Content>
    );
  }

  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const dept = sp.dept || undefined;
  const status = STATUSES.includes(sp.status as StatusKey)
    ? (sp.status as StatusKey)
    : undefined;

  const [people, departments] = await Promise.all([
    listDirectory(ctx, { q, departmentId: dept, status }),
    listDepartments(ctx),
  ]);

  const scope = widestScope(ctx.access, "employees.view");
  const scopeLabel: "SELF" | "TEAM" | "COMPANY" =
    !scope || scope === "SELF" ? "SELF" : scope === "TEAM" || scope === "DEPARTMENT" ? "TEAM" : "COMPANY";

  // Status counts are computed against the unfiltered-by-status list
  // for the user's permission scope — the chips show "Active · 47" etc.
  const statusCounts = {
    all: people.length,
    active: people.filter((p) => p.status === "active").length,
    invited: people.filter((p) => p.status === "invited").length,
    suspended: people.filter((p) => p.status === "suspended").length,
  };

  const subtitle =
    scopeLabel === "COMPANY"
      ? `Everyone at ${ctx.org.name}`
      : scopeLabel === "TEAM"
        ? "Your direct reports"
        : "Your profile";

  return (
    <Content width="wide">
      <PageHeader title="People" subtitle={subtitle}>
        <PeopleDirectoryHeaderAction canInvite={can(ctx.access, "users.manage")} />
      </PageHeader>

      <PeopleDirectory
        people={people}
        departments={departments}
        statusCounts={statusCounts}
        scope={scopeLabel}
      />
    </Content>
  );
}
