export const dynamic = "force-dynamic";

import Link from "next/link";

import { Card, EmptyState, btn } from "@/components/ui";
import { CsvExportLink } from "@/components/csv-export";
import { requireAuthPage } from "@/lib/page-auth";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { can } from "@/modules/iam/engine";
import { listAuditLogs } from "@/modules/admin/service";

export const metadata = { title: "Audit log" };

const PAGE_SIZE = 50;

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; action?: string; actorId?: string }>;
}) {
  const ctx = await requireAuthPage();
  if (!can(ctx.access, "audit.view")) {
    return (
      <Card>
        <EmptyState title="Audit log" hint="You don't have audit access." />
      </Card>
    );
  }

  const sp = await searchParams;
  const actionFilter = sp.action?.includes(",") ? undefined : sp.action;
  const entries = await listAuditLogs(ctx, {
    q: sp.q,
    action: actionFilter,
    actorId: sp.actorId,
    limit: PAGE_SIZE,
  });

  // List every member of the org as a possible actor filter — small (≤200)
  // and gives admins a way to scope by teammate.
  const actorList = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.organizationId, ctx.user.organizationId)))
    .orderBy(asc(users.name))
    .limit(200);

  const csvRows: (string | number | null | undefined)[][] = [
    ["created_at", "action", "entity_type", "entity_id", "actor_name", "ip", "old_value", "new_value"],
    ...entries.map((e) => [
      new Date(e.createdAt).toISOString(),
      e.action,
      e.entityType,
      e.entityId ?? "",
      e.actorName ?? "",
      e.ip ?? "",
      e.oldValue ? JSON.stringify(e.oldValue) : "",
      e.newValue ? JSON.stringify(e.newValue) : "",
    ]),
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-primary">Audit log</h1>
          <p className="mt-1 text-sm text-secondary">
            Every important administrative action. Filter, search, and export.
          </p>
        </div>
        <CsvExportLink
          filename={`audit-${new Date().toISOString().slice(0, 10)}.csv`}
          rows={csvRows}
          className={`${btn.secondary} ${btn.small}`}
        />
      </header>

      <Card>
        <form className="flex flex-wrap items-end gap-2 border-b border-border-subtle px-5 py-4 text-sm">
          <label className="grow text-xs font-medium">
            Search
            <input
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="action or entity…"
              className="mt-1 w-full rounded-lg border border-border-default bg-surface px-3 py-1.5 text-sm"
            />
          </label>
          <label className="grow text-xs font-medium">
            Action
            <input
              name="action"
              defaultValue={sp.action ?? ""}
              placeholder="USER_SUSPENDED"
              className="mt-1 w-full rounded-lg border border-border-default bg-surface px-3 py-1.5 text-sm font-mono"
            />
          </label>
          <label className="grow text-xs font-medium">
            Actor
            <select
              name="actorId"
              defaultValue={sp.actorId ?? ""}
              className="mt-1 w-full rounded-lg border border-border-default bg-surface px-3 py-1.5 text-sm"
            >
              <option value="">All actors</option>
              {actorList.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name ?? a.email}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-on-brand hover:bg-brand-hover">
            Apply
          </button>
          <Link
            href="/admin/audit"
            className="rounded-lg border border-border-default bg-surface px-3 py-1.5 text-sm font-medium text-secondary hover:bg-surface-hover"
          >
            Clear
          </Link>
        </form>

        {entries.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-tertiary">No matching audit events.</p>
        ) : (
          <ul className="divide-y divide-border-subtle text-sm">
            {entries.map((e) => (
              <li key={e.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs">{e.action}</span>
                  <span className="ml-auto text-xs text-tertiary">{new Date(e.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-0.5 text-xs text-tertiary">
                  {e.entityType}
                  {e.entityId ? ` · ${e.entityId}` : ""}
                  {e.actorName ? ` · ${e.actorName}` : ""}
                  {e.ip ? ` · ${e.ip}` : ""}
                </p>
                {(e.oldValue || e.newValue) ? (
                  <pre className="mt-1 max-h-32 overflow-auto rounded bg-surface-subtle px-2 py-1 text-[11px] text-secondary">
                    {e.oldValue ? `before: ${JSON.stringify(e.oldValue)}\n` : ""}
                    {e.newValue ? `after:  ${JSON.stringify(e.newValue)}` : ""}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {entries.length === PAGE_SIZE && (
          <div className="border-t border-border-subtle px-5 py-3 text-xs text-tertiary">
            Showing the first {PAGE_SIZE} matches. Refine the filter to narrow further.
          </div>
        )}
      </Card>
    </div>
  );
}
