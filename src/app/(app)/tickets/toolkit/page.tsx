import { Content, PageHeader } from "@/components/page-header";
import { Card, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { listCannedResponses, listMacros } from "@/modules/tickets/toolkit";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agent Toolkit" };

export default async function ToolkitPage() {
  const ctx = await requireAuthPage();
  if (!can(ctx.access, "tickets.manage")) {
    return (
      <Content>
        <Card>
          <EmptyState title="Agents only" hint="You need ticket management access to use the agent toolkit." />
        </Card>
      </Content>
    );
  }

  const [canned, macros] = await Promise.all([listCannedResponses(ctx), listMacros(ctx)]);
  const { ToolkitAdminClient } = await import("@/components/toolkit-admin-client");

  return (
    <Content width="wide">
      <PageHeader
        title="Agent Toolkit"
        subtitle="Canned responses and macros speed up everyday ticket work."
      />
      <ToolkitAdminClient
        data={{
          canned: canned.map((c) => ({
            id: c.id,
            name: c.name,
            category: c.category,
            body: c.body,
          })),
          macros: macros.map((m) => ({
            id: m.id,
            name: m.name,
            description: m.description,
            actions: m.actions as { op: string; value: string }[],
          })),
        }}
      />
    </Content>
  );
}