export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionButton, SimpleForm } from "@/components/finance-people-actions";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { ApiError } from "@/lib/errors";
import { can } from "@/modules/iam/engine";
import { getJourney } from "@/modules/people-ops/service";

export const metadata = { title: "Journey" };

export default async function JourneyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuthPage();
  if (!can(ctx.access, "lifecycle.manage")) {
    return <Card><EmptyState title="Lifecycle" hint="You don't have HR lifecycle permissions." /></Card>;
  }
  const { id } = await params;
  let j;
  try {
    j = await getJourney(ctx, id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/people/lifecycle?kind=${j.kind}`} className="text-xs text-tertiary hover:underline">← Back</Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-primary">{j.userName}</h1>
          <p className="text-sm capitalize text-secondary">{j.kind} journey</p>
        </div>
        <Badge tone={j.status === "completed" ? "green" : "amber"}>{j.status}</Badge>
      </header>

      <Card>
        <CardHeader title={`Checklist (${j.items.filter((i) => i.done).length}/${j.items.length})`} />
        {j.items.length === 0 ? <p className="px-5 py-4 text-sm text-tertiary">No items yet.</p> : (
          <ul className="divide-y divide-border-subtle text-sm">
            {j.items.map((it) => (
              <li key={it.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className={it.done ? "line-through text-tertiary" : "font-medium"}>{it.title}</p>
                  <p className="text-xs capitalize text-tertiary">{it.kind.replace("_", " ")}</p>
                </div>
                <ActionButton
                  label={it.done ? "Reopen" : "Mark done"}
                  path={`/api/v1/people-ops/journeys/${id}`}
                  body={{ action: "toggle_item", itemId: it.id, done: !it.done }}
                  className="rounded-md border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-hover"
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Add item" />
        <SimpleForm
          path={`/api/v1/people-ops/journeys/${id}`}
          method="PATCH"
          submitLabel="Add item"
          payload={{ action: "add_item" }}
          fields={[
            { name: "title", label: "Item", required: true },
            { name: "kind", label: "Kind", type: "select", options: [
              { value: "task", label: "Task" }, { value: "document", label: "Document" },
              { value: "knowledge", label: "Knowledge" }, { value: "access", label: "Access" },
              { value: "asset", label: "Asset" }, { value: "exit_interview", label: "Exit interview" },
            ]},
          ]}
        />
      </Card>
    </div>
  );
}
