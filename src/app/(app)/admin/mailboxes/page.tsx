export const dynamic = "force-dynamic";

import { MailboxesAdminClient } from "@/components/mailboxes-admin-client";
import { AdminNav } from "@/components/admin-ui";
import { Card, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { adminTabsFor } from "@/lib/admin-nav";
import { requireAuthPage } from "@/lib/page-auth";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { can } from "@/modules/iam/engine";
import { listMailboxes } from "@/modules/mailboxes/service";

export const metadata = { title: "Mailboxes" };

export default async function MailboxesAdminPage() {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "tickets") || !can(ctx.access, "tickets.manage")) {
    return (
      <Card>
        <EmptyState title="Mailboxes" hint="Only support agents can configure email intake." />
      </Card>
    );
  }
  const mailboxes = await listMailboxes(ctx);
  const tabs = adminTabsFor(
    (p) => can(ctx.access, p),
    ctx.org.modules
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Email-to-ticket"
        subtitle="Connect an inbox so emails become support tickets automatically."
      />
      <AdminNav items={tabs} />
      <MailboxesAdminClient
        mailboxes={mailboxes.map((m) => ({
          id: m.id,
          email: m.email,
          imapHost: m.imapHost,
          enabled: m.enabled,
          lastSyncAt: m.lastSyncAt?.toISOString() ?? null,
          lastError: m.lastError,
        }))}
      />
    </div>
  );
}