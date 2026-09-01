export const dynamic = "force-dynamic";

import { BrandingClient } from "@/components/branding-client";
import { Card, CardHeader } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";

export const metadata = { title: "Organization" };

export default async function OrganizationSettingsPage() {
  const ctx = await requireAuthPage();
  const canManage = can(ctx.access, "settings.manage");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
          Organization
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Branding shown across your workspace.
        </p>
      </header>

      <Card>
        <CardHeader title="Logo" />
        <BrandingClient
          hasLogo={Boolean(ctx.org.logoUrl)}
          orgName={ctx.org.name}
          canManage={canManage}
        />
      </Card>
    </div>
  );
}
