export const dynamic = "force-dynamic";

import { PlatformClient } from "@/components/platform-client";
import { Card, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { listTenants } from "@/modules/platform/service";

export const metadata = { title: "Platform" };

export default async function PlatformPage() {
  const ctx = await requireAuthPage();
  if (!can(ctx.access, "platform.admin")) {
    return (
      <Card>
        <EmptyState
          title="Platform console"
          hint="Only the Platform Super Admin can access this area."
        />
      </Card>
    );
  }

  const tenants = await listTenants(ctx);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
          Platform Console
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Tenant registry. Suspending a tenant blocks all of its users at sign-in without
          touching their data.
        </p>
      </header>

      <PlatformClient
        tenants={tenants.map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          status: t.status,
          userCount: t.userCount,
          createdAt: t.createdAt.toISOString(),
        }))}
        selfOrgId={ctx.user.organizationId}
      />
    </div>
  );
}
