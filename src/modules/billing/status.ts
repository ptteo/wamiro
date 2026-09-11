export type BillingStatus = "trial" | "active" | "past_due" | "cancelled";

/** Map a Paddle subscription.status (or event name) onto our billing_status. */
export function mapPaddleSubscriptionStatus(status: string | null | undefined): BillingStatus | null {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "active") return "active";
  if (s === "trialing" || s === "trial") return "trial";
  if (s === "past_due" || s === "paused") return "past_due";
  if (s === "canceled" || s === "cancelled") return "cancelled";
  return null;
}
