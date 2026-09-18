export const dynamic = "force-dynamic";

import Link from "next/link";

import { AdminNav, AdminSection } from "@/components/admin-ui";
import { Badge, Card, EmptyState, btn } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { adminTabsFor } from "@/lib/admin-nav";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { isModuleEnabled } from "@/modules/iam/catalog";
import { getUserDetail } from "@/modules/admin/service";
import { ApiError } from "@/lib/errors";
import { notFound } from "next/navigation";
import { SessionRevokeButton, UserStatusButton } from "@/components/admin-user-actions";

export const metadata = { title: "User detail" };

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireAuthPage();
  if (!isModuleEnabled(ctx.org.modules, "admin") || !can(ctx.access, "users.manage")) {
    return (
      <>
        <PageHeader title="Access control" />
        <Card>
          <EmptyState title="Access control" hint="You don't have user management permissions." />
        </Card>
      </>
    );
  }
  const { id } = await params;
  let detail;
  try {
    detail = await getUserDetail(ctx, id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const statusTone = detail.status === "active" ? "green" : detail.status === "suspended" ? "amber" : "neutral";

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title={detail.name}
        subtitle={detail.email}
        breadcrumb={[
          { label: "Admin", href: "/admin" },
          { label: "Access control", href: "/admin/users" },
        ]}
      >
        {detail.id !== ctx.user.id ? (
          <UserStatusButton userId={detail.id} currentStatus={detail.status} />
        ) : (
          <Badge tone="neutral">This is you</Badge>
        )}
      </PageHeader>

      <AdminNav
        items={adminTabsFor(
          (p) => can(ctx.access, p),
          ctx.org.modules
        )}
      />

      <AdminSection title="Identity">
        <dl className="divide-y divide-border-subtle text-sm">
          <KV k="Status" v={<Badge tone={statusTone}>{detail.status}</Badge>} />
          <KV k="Email" v={detail.email} />
          <KV k="Department" v={detail.department ?? "—"} />
          <KV k="Title" v={detail.jobTitle ?? "—"} />
          <KV k="Created" v={new Date(detail.createdAt).toLocaleString()} />
          <KV k="Last login" v={detail.lastLoginAt ? new Date(detail.lastLoginAt).toLocaleString() : "—"} />
          <KV
            k="MFA"
            v={
              detail.totpEnabled ? (
                <Badge tone="green">Enrolled</Badge>
              ) : (
                <Badge tone="neutral">Not enrolled</Badge>
              )
            }
          />
        </dl>
      </AdminSection>

      <AdminSection title="Roles" subtitle="Direct role grants">
        {detail.roles.length === 0 ? (
          <p className="py-4 text-sm text-tertiary">No roles assigned.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {detail.roles.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                <Link href={`/admin/roles/${r.id}`} className="font-medium text-primary hover:underline">
                  {r.name}
                </Link>
                <Badge tone="brand">{r.key}</Badge>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      <AdminSection title="Sessions" subtitle="Revocation is audited">
        {detail.sessions.length === 0 ? (
          <p className="py-4 text-sm text-tertiary">No sessions on record.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {detail.sessions.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="break-all sm:truncate">
                    {s.userAgent ? shortUA(s.userAgent) : "Unknown device"}
                    {s.ip ? ` · ${s.ip}` : ""}
                  </p>
                  <p className="text-xs text-tertiary">
                    Created {new Date(s.createdAt).toLocaleString()} · expires{" "}
                    {new Date(s.expiresAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex w-full items-center gap-2 sm:w-auto">
                  {s.expired ? <Badge tone="neutral">Expired</Badge> : <Badge tone="green">Active</Badge>}
                  {s.expired ? null : (
                    <SessionRevokeButton
                      userId={detail.id}
                      sessionId={s.id}
                      all={false}
                      className={`${btn.secondary} ${btn.small} ml-auto sm:ml-0`}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {detail.sessions.some((s) => !s.expired) ? (
          <div className="mt-3">
            <SessionRevokeButton
              userId={detail.id}
              all
              confirm
              className={`${btn.secondary} ${btn.small} w-full sm:w-auto`}
            >
              Revoke all sessions
            </SessionRevokeButton>
          </div>
        ) : null}
      </AdminSection>

      <AdminSection
        title="Activity"
        subtitle="Recent actions by this user"
        action={
          <Link href={`/admin/audit?actorId=${detail.id}`} className={`${btn.secondary} ${btn.small}`}>
            Open in audit
          </Link>
        }
      >
        {detail.activity.length === 0 ? (
          <p className="py-4 text-sm text-tertiary">No recorded activity.</p>
        ) : (
          <ul className="divide-y divide-border-subtle text-sm">
            {detail.activity.map((a) => (
              <li key={a.id} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
                <span className="break-all font-mono text-xs">{a.action}</span>
                <span className="min-w-0 break-all text-xs text-tertiary">
                  {a.entityType}
                  {a.entityId ? ` · ${a.entityId}` : ""}
                </span>
                <span className="text-xs text-tertiary sm:ml-auto">
                  {new Date(a.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <dt className="text-tertiary">{k}</dt>
      <dd className="min-w-0 break-all font-medium">{v}</dd>
    </div>
  );
}

function shortUA(ua: string) {
  return ua.length > 60 ? ua.slice(0, 60) + "…" : ua;
}
