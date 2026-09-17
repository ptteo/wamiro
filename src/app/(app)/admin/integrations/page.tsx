import { Content, PageHeader } from "@/components/page-header";
import { AdminNav } from "@/components/admin-ui";
import { Card, EmptyState } from "@/components/ui";
import { adminTabsFor } from "@/lib/admin-nav";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { listWebhooks } from "@/modules/webhooks/service";
import { getConfig } from "@/modules/sso/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  const ctx = await requireAuthPage();
  if (!can(ctx.access, "settings.manage")) {
    return (
      <Content>
        <Card>
          <EmptyState title="Admins only" hint="You need settings management access to configure integrations." />
        </Card>
      </Content>
    );
  }

  const [webhooks, sso] = await Promise.all([listWebhooks(ctx), getConfig(ctx.user.organizationId)]);
  const { IntegrationsAdminClient } = await import("@/components/integrations-admin-client");

  return (
    <Content width="wide">
      <PageHeader
        title="Integrations"
        subtitle="Connect your systems: signed webhooks, single sign-on, and SCIM provisioning."
      />
      <AdminNav
        items={adminTabsFor(
          (p) => can(ctx.access, p),
          ctx.org.modules
        )}
      />
      <IntegrationsAdminClient
        webhooks={webhooks.map((w) => ({
          id: w.id,
          name: w.name,
          url: w.url,
          events: w.events,
          active: w.active,
          lastStatus: w.lastStatus ?? null,
          lastError: w.lastError ?? null,
          lastDeliveredAt: w.lastDeliveredAt ? w.lastDeliveredAt.toISOString() : null,
        }))}
        sso={sso ? { ...sso, clientSecret: null as string | null } : null}
        scimUrl={`${process.env.APP_URL ?? ""}/api/v1/scim/v2`}
      />
    </Content>
  );
}