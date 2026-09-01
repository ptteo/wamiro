import { SupportClient } from "@/components/support-client";
import { requireAuthPage } from "@/lib/page-auth";
import { listMyTickets, zammadConfig } from "@/modules/integrations/zammad";

export const dynamic = "force-dynamic";

export const metadata = { title: "Support" };

export default async function SupportPage() {
  const ctx = await requireAuthPage();
  const configured = zammadConfig() !== null;

  // server-side fetch; tolerate an unreachable helpdesk rather than erroring the page
  let tickets: {
    id: number;
    title: string;
    state: string;
    priority: string;
    createdAt: string;
    updatedAt: string | null;
  }[] = [];
  let unreachable = false;
  if (configured) {
    try {
      tickets = await listMyTickets(ctx.user.email);
    } catch {
      unreachable = true;
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Support</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Raise IT and workplace issues — tracked end-to-end by the helpdesk.
        </p>
      </header>

      {unreachable && (
        <p role="status" className="rounded-lg bg-warning-subtle px-4 py-3 text-sm text-warning">
          The helpdesk is temporarily unreachable — showing no tickets right now.
        </p>
      )}

      <SupportClient tickets={tickets} configured={configured} />
    </div>
  );
}
