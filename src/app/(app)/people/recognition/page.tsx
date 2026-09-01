export const dynamic = "force-dynamic";

import { SimpleForm } from "@/components/finance-people-actions";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { recognitionFeed } from "@/modules/people-ops/service";

export const metadata = { title: "Recognition" };

export default async function RecognitionPage() {
  const ctx = await requireAuthPage();
  if (!can(ctx.access, "recognition.give")) {
    return <Card><EmptyState title="Recognition" hint="No access." /></Card>;
  }
  const feed = await recognitionFeed(ctx);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-primary">Recognition</h1>
        <p className="mt-1 text-sm text-secondary">Appreciation between colleagues. Restrained by design.</p>
      </header>

      <Card>
        <CardHeader title="Recognize a colleague" />
        <SimpleForm path="/api/v1/people-ops/recognitions" submitLabel="Send recognition"
          fields={[
            { name: "toUserId", label: "Recipient user id", required: true },
            { name: "message", label: "Message", type: "textarea", required: true },
            { name: "badge", label: "Badge", type: "select", options: [
              { value: "thanks", label: "Thanks" }, { value: "great_work", label: "Great work" },
              { value: "team_player", label: "Team player" }, { value: "customer_hero", label: "Customer hero" },
              { value: "innovation", label: "Innovation" },
            ]},
          ]} />
      </Card>

      <Card>
        <CardHeader title={`Recent (${feed.length})`} />
        {feed.length === 0 ? <p className="px-5 py-4 text-sm text-tertiary">No recognitions yet.</p> : (
          <ul className="divide-y divide-border-subtle text-sm">
            {feed.map((r) => (
              <li key={r.id} className="px-5 py-3">
                <p><span className="font-medium">{r.fromName}</span> → <span className="font-medium">{r.toName}</span>
                  <span className="ml-2 text-xs capitalize text-brand-text">({r.badge.replace("_", " ")})</span></p>
                <p className="mt-0.5">{r.message}</p>
                <p className="text-xs text-tertiary">{new Date(r.createdAt).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
