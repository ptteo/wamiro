import { Content, PageHeader } from "@/components/page-header";
import { OrgChartClient } from "@/components/org-chart";
import { Card, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { can, widestScope } from "@/modules/iam/engine";
import { orgData } from "@/modules/people/orgchart";

export const dynamic = "force-dynamic";
export const metadata = { title: "Org Chart" };

type View = "departments" | "focus";
const VIEWS: readonly View[] = ["departments", "focus"] as const;

export default async function OrgChartPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; focus?: string }>;
}) {
  const ctx = await requireAuthPage();
  if (
    !isModuleEnabled(ctx.org.modules, "people") ||
    !["COMPANY", "GLOBAL"].includes(widestScope(ctx.access, "employees.view") ?? "")
  ) {
    return (
      <Content>
        <Card>
          <EmptyState
            title="Org chart unavailable"
            hint="The full organization chart requires company-wide directory access."
          />
        </Card>
      </Content>
    );
  }

  const sp = await searchParams;
  const view: View = (VIEWS as readonly string[]).includes(sp.view ?? "")
    ? (sp.view as View)
    : "departments";
  const focus = sp.focus ?? null;

  const data = await orgData(ctx);
  if (!data) {
    return (
      <Content>
        <Card>
          <EmptyState
            title="Org chart unavailable"
            hint="The full organization chart requires company-wide directory access."
          />
        </Card>
      </Content>
    );
  }

  return (
    <Content width="wide">
      <PageHeader
        title="Org Chart"
        subtitle="The company broken down by team. Click a person to focus on them."
      />
      <OrgChartClient
        data={data as never}
        canEdit={can(ctx.access, "employees.edit")}
        initialFocus={focus}
        initialView={view}
      />
    </Content>
  );
}
