import { PageHeader } from "@/components/page-header";
import { BillingActions } from "@/components/billing-client";
import { Badge, btn } from "@/components/ui";
import { requireAuthPage } from "@/lib/page-auth";
import { can } from "@/modules/iam/engine";
import { subscriptionView } from "@/modules/billing/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plan & Billing" };

const STATUS_TONE: Record<string, "green" | "amber" | "red" | "neutral" | "brand"> = {
  trial: "brand",
  active: "green",
  past_due: "amber",
  cancelled: "red",
};

export default async function BillingSettingsPage() {
  const ctx = await requireAuthPage();
  const sub = await subscriptionView(ctx);
  const canManage = can(ctx.access, "settings.manage");
  const pct =
    sub.seatLimit === null ? null : Math.min(100, Math.round((sub.activeSeats / Math.max(1, sub.seatLimit)) * 100));

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader title="Plan & Billing" subtitle="Your subscription, seat usage and what comes next." />

      {sub.billingStatus === "past_due" && (
        <div className="rounded-lg border border-amber/40 bg-amber-subtle px-4 py-3 text-sm text-amber">
          Your subscription payment is overdue. Features stay available, but access will be suspended if it is not
          resolved. {canManage && sub.paddleConfigured && sub.hasCustomer
            ? "Use Manage billing to update the card."
            : "Please contact support or your administrator."}
        </div>
      )}

      {sub.seatsOverCap && (
        <div className="rounded-lg border border-amber/40 bg-amber-subtle px-4 py-3 text-sm text-amber">
          You have {sub.activeSeats} people on a plan that includes {sub.seatLimit}. Extra seats are billed on the next
          invoice.
        </div>
      )}

      <section className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
        <div className="flex flex-col gap-4 border-b border-border-subtle p-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-tertiary">
              Current plan
              <Badge tone={STATUS_TONE[sub.billingStatus] ?? "neutral"}>{sub.billingStatus}</Badge>
            </p>
            <h2 className="mt-1 text-xl font-semibold text-primary">{sub.planName}</h2>
            <p className="mt-0.5 text-sm text-secondary">{sub.planTagline}</p>
            {sub.billingStatus === "trial" && sub.trialDaysLeft !== null ? (
              <p className="mt-1 text-xs font-medium text-brand">
                {sub.trialDaysLeft} day{sub.trialDaysLeft === 1 ? "" : "s"} left in your trial
              </p>
            ) : null}
            {sub.billingProvider ? (
              <p className="mt-1 text-xs text-tertiary">Billed through {sub.billingProvider}</p>
            ) : (
              <p className="mt-1 text-xs text-tertiary">
                {sub.paddleConfigured ? "Upgrade below to pay with Paddle." : "Invoiced by the platform operator"}
              </p>
            )}
          </div>
          <div className="shrink-0">
            {!sub.paddleConfigured && sub.upgradeUrl ? (
              <a href={sub.upgradeUrl} target="_blank" rel="noreferrer" className={`${btn.primary} ${btn.small}`}>
                Upgrade plan
              </a>
            ) : !sub.paddleConfigured ? (
              <a
                href="mailto:sales@wamiro.app?subject=Upgrade request"
                className={`${btn.primary} ${btn.small}`}
              >
                Talk to sales
              </a>
            ) : null}
          </div>
        </div>

        <div className="grid gap-px border-b border-border-subtle bg-border-subtle sm:grid-cols-3">
          <div className="bg-surface px-5 py-4">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-tertiary">Seat usage</dt>
            <dd className="mt-1 text-lg font-semibold text-primary">
              {sub.activeSeats}
              <span className="text-sm font-normal text-tertiary"> / {sub.seatLimit ?? "unlimited"}</span>
            </dd>
            {pct !== null && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border-subtle" aria-hidden>
                <div
                  className={`h-full rounded-full ${pct >= 90 ? "bg-warning" : "bg-brand"}`}
                  style={{ width: `${Math.max(4, pct)}%` }}
                />
              </div>
            )}
          </div>
          <div className="bg-surface px-5 py-4">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-tertiary">Price</dt>
            <dd className="mt-1 text-lg font-semibold text-primary">
              {sub.monthlyPerSeat === null || sub.monthlyPerSeat === 0 ? (
                "Free"
              ) : (
                <>
                  ${sub.monthlyPerSeat}
                  <span className="text-sm font-normal text-tertiary">/person/month</span>
                </>
              )}
            </dd>
          </div>
          <div className="bg-surface px-5 py-4">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-tertiary">Trial ends</dt>
            <dd className="mt-1 text-lg font-semibold text-primary">
              {sub.trialEndsAt ? new Date(sub.trialEndsAt).toLocaleDateString() : "—"}
            </dd>
          </div>
        </div>

        <div className="px-5 py-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-tertiary">What&apos;s included</p>
          <ul className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {sub.highlights.map((h) => (
              <li key={h} className="flex items-center gap-2 text-sm text-secondary">
                <span className="text-brand" aria-hidden>
                  ✓
                </span>
                {h}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <BillingActions
        canManage={canManage}
        paddleConfigured={sub.paddleConfigured}
        hasCustomer={sub.hasCustomer}
        hasSubscription={sub.hasSubscription}
        currentPlan={sub.plan}
        billingStatus={sub.billingStatus}
        plans={sub.plans}
        invoices={sub.invoices}
      />
    </div>
  );
}
