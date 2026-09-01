export const dynamic = "force-dynamic";

import Link from "next/link";

import { Badge, Card, CardHeader, EmptyState, btn } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
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
  if (!can(ctx.access, "users.manage")) {
    return (
      <Card>
        <EmptyState title="Access control" hint="You don't have user management permissions." />
      </Card>
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
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/admin/users" className="text-xs text-tertiary hover:underline">
            ← Back to users
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-primary">{detail.name}</h1>
          <p className="mt-0.5 text-sm text-secondary">{detail.email}</p>
        </div>
        {detail.id !== ctx.user.id ? (
          <UserStatusButton
            userId={detail.id}
            currentStatus={detail.status}
          />
        ) : (
          <Badge tone="neutral">This is you</Badge>
        )}
      </header>

      <Card>
        <CardHeader title="Identity" />
        <dl className="divide-y divide-border-subtle text-sm">
          <KV k="Status" v={<Badge tone={statusTone as "green" | "amber" | "neutral"}>{detail.status}</Badge>} />
          <KV k="Email" v={detail.email} />
          <KV k="Department" v={detail.department ?? "—"} />
          <KV k="Title" v={detail.jobTitle ?? "—"} />
          <KV k="Created" v={new Date(detail.createdAt).toLocaleString()} />
          <KV k="Last login" v={detail.lastLoginAt ? new Date(detail.lastLoginAt).toLocaleString() : "—"} />
          <KV k="MFA" v={detail.totpEnabled ? <Badge tone="green">Enrolled</Badge> : <Badge tone="neutral">Not enrolled</Badge>} />
        </dl>
      </Card>

      <Card>
        <CardHeader
          title="Roles"
          subtitle="Direct role grants. Overrides are listed under their own area."
        />
        {detail.roles.length === 0 ? (
          <p className="px-5 py-4 text-sm text-tertiary">No roles assigned.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {detail.roles.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <Link href={`/admin/roles/${r.id}`} className="font-medium hover:underline">
                  {r.name}
                </Link>
                <Badge tone="brand">{r.key}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Sessions"
          subtitle="Active and recent sessions for this user. High-impact revocations require confirmation."
        />
        {detail.sessions.length === 0 ? (
          <p className="px-5 py-4 text-sm text-tertiary">No sessions on record.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {detail.sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate">
                    {s.userAgent ? shortUA(s.userAgent) : "Unknown device"}
                    {s.ip ? ` · ${s.ip}` : ""}
                  </p>
                  <p className="text-xs text-tertiary">
                    Created {new Date(s.createdAt).toLocaleString()} · expires {new Date(s.expiresAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {s.expired ? <Badge tone="neutral">Expired</Badge> : <Badge tone="green">Active</Badge>}
                  {s.expired ? null : (
                    <SessionRevokeButton
                      userId={detail.id}
                      sessionId={s.id}
                      all={false}
                      className={`${btn.secondary} ${btn.small}`}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {detail.sessions.some((s) => !s.expired) ? (
          <div className="flex justify-end border-t border-border-subtle px-5 py-3">
            <SessionRevokeButton
              userId={detail.id}
              all
              confirm
              className={`${btn.secondary} ${btn.small}`}
            >
              Revoke all sessions
            </SessionRevokeButton>
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="Activity"
          subtitle="Recent administrative activity performed by this user."
          action={
            <Link href={`/admin/audit?actorId=${detail.id}`} className={`${btn.secondary} ${btn.small}`}>
              Open in audit
            </Link>
          }
        />
        {detail.activity.length === 0 ? (
          <p className="px-5 py-4 text-sm text-tertiary">No recorded activity.</p>
        ) : (
          <ul className="divide-y divide-border-subtle text-sm">
            {detail.activity.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5">
                <span className="font-mono text-xs">{a.action}</span>
                <span className="text-xs text-tertiary">
                  {a.entityType}
                  {a.entityId ? ` · ${a.entityId}` : ""}
                </span>
                <span className="ml-auto text-xs text-tertiary">{new Date(a.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-2.5">
      <dt className="text-tertiary">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}

function shortUA(ua: string) {
  return ua.length > 60 ? ua.slice(0, 60) + "…" : ua;
}
