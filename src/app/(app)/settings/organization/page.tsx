export const dynamic = "force-dynamic";

import { BrandingClient } from "@/components/branding-client";
import { PageHeader } from "@/components/page-header";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";

export const metadata = { title: "Organization" };

export default async function OrganizationSettingsPage() {
  const ctx = await requireAuthPage();
  const canManage = can(ctx.access, "settings.manage");

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Organization"
        subtitle="Name, mark, and colors shown across this workspace."
      />

      <section className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
          {ctx.org.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- tenant logo from our API
            <img
              src="/api/v1/org/branding/logo"
              alt=""
              className="h-16 w-16 shrink-0 rounded-xl border border-border-subtle object-cover"
            />
          ) : (
            <span
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl text-2xl font-bold text-white"
              style={{ background: ctx.org.primaryColor }}
            >
              {ctx.org.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-primary">{ctx.org.name}</h2>
            <p className="mt-0.5 truncate font-mono text-xs text-tertiary">{ctx.org.slug}</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 divide-y divide-border-subtle border-t border-border-subtle sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <div className="px-4 py-3 sm:px-5">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-tertiary">Primary</dt>
            <dd className="mt-1.5 flex items-center gap-2 text-sm text-primary">
              <span
                className="h-4 w-4 rounded-full border border-border-subtle"
                style={{ background: ctx.org.primaryColor }}
                aria-hidden
              />
              <span className="font-mono text-xs">{ctx.org.primaryColor}</span>
            </dd>
          </div>
          <div className="px-4 py-3 sm:px-5">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-tertiary">Secondary</dt>
            <dd className="mt-1.5 flex items-center gap-2 text-sm text-primary">
              <span
                className="h-4 w-4 rounded-full border border-border-subtle"
                style={{ background: ctx.org.secondaryColor }}
                aria-hidden
              />
              <span className="font-mono text-xs">{ctx.org.secondaryColor}</span>
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-border-subtle bg-surface">
        <div className="border-b border-border-subtle px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-primary">Logo</h2>
          <p className="mt-0.5 text-xs text-tertiary">Shown in the sidebar and on signed-in pages.</p>
        </div>
        <BrandingClient
          hasLogo={Boolean(ctx.org.logoUrl)}
          orgName={ctx.org.name}
          canManage={canManage}
        />
      </section>
    </div>
  );
}
