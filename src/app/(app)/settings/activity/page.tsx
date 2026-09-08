import { Card, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { requireAuthPage } from "@/lib/page-auth";
import { listMyActivity } from "@/modules/activity/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "My activity" };

export default async function MyActivityPage() {
  const ctx = await requireAuthPage();
  const items = await listMyActivity(ctx);

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="My activity"
        subtitle="Actions you took in this company. Organization-wide audit stays under Admin."
      />
      <Card>
        {items.length === 0 ? (
          <EmptyState title="No activity yet" hint="Sign-ins, leave, tickets, and similar actions you take will show up here." />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {items.map((row) => (
              <li key={row.id} className="flex flex-col gap-0.5 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm text-primary">{row.label}</span>
                <span className="text-xs text-tertiary">{new Date(row.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
