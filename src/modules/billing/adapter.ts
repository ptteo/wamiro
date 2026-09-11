/**
 * Paddle Billing adapter (fetch + node crypto; no official SDK).
 *
 * Unset PADDLE_API_KEY → configured() is false and mutating calls throw
 * 503 so Settings keeps "Talk to sales". Sandbox vs live is PADDLE_ENV.
 */
import { ApiError } from "@/lib/errors";

export type PaidPlanId = "growth" | "scale";

function trimEnv(name: string): string | null {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : null;
}

export function paddleConfigured(): boolean {
  return Boolean(trimEnv("PADDLE_API_KEY"));
}

export function paddleApiBase(): string {
  return trimEnv("PADDLE_ENV") === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
}

export function priceIdForPlan(plan: string): string | null {
  if (plan === "growth") return trimEnv("PADDLE_PRICE_GROWTH");
  if (plan === "scale") return trimEnv("PADDLE_PRICE_SCALE");
  return null;
}

export function planFromPriceId(priceId: string | null | undefined): PaidPlanId | null {
  if (!priceId) return null;
  if (priceId === trimEnv("PADDLE_PRICE_GROWTH")) return "growth";
  if (priceId === trimEnv("PADDLE_PRICE_SCALE")) return "scale";
  return null;
}

function requireConfigured(): string {
  const key = trimEnv("PADDLE_API_KEY");
  if (!key) throw ApiError.unavailable("Self-serve billing is not configured. Contact sales to upgrade.");
  return key;
}

interface PaddleErrorBody {
  error?: { detail?: string; code?: string };
}

async function paddleFetch<T>(path: string, init: RequestInit): Promise<T> {
  const key = requireConfigured();
  const res = await fetch(`${paddleApiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Paddle-Version": "1",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as PaddleErrorBody & { data?: T };
  if (!res.ok) {
    const detail = json.error?.detail ?? `Paddle ${res.status}`;
    throw ApiError.badGateway(detail);
  }
  return json.data as T;
}

export async function createCheckoutUrl(input: {
  orgId: string;
  plan: PaidPlanId;
  quantity: number;
  email?: string | null;
  customerId?: string | null;
}): Promise<string> {
  const priceId = priceIdForPlan(input.plan);
  if (!priceId) {
    throw ApiError.unavailable(`No Paddle price is configured for the ${input.plan} plan.`);
  }
  const quantity = Math.max(1, Math.floor(input.quantity));
  const body: Record<string, unknown> = {
    items: [{ price_id: priceId, quantity }],
    collection_mode: "automatic",
    custom_data: { organizationId: input.orgId },
  };
  if (input.customerId) body.customer_id = input.customerId;
  const data = await paddleFetch<{ checkout?: { url?: string | null } }>("/transactions", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const url = data?.checkout?.url;
  if (!url) throw ApiError.badGateway("Paddle did not return a checkout URL");
  return url;
}

export async function createPortalUrl(input: {
  customerId: string;
  subscriptionId?: string | null;
}): Promise<string> {
  const body: Record<string, unknown> = {};
  if (input.subscriptionId) body.subscription_ids = [input.subscriptionId];
  const data = await paddleFetch<{ urls?: { general?: { overview?: string } } }>(
    `/customers/${encodeURIComponent(input.customerId)}/portal-sessions`,
    { method: "POST", body: JSON.stringify(body) },
  );
  const url = data?.urls?.general?.overview;
  if (!url) throw ApiError.badGateway("Paddle did not return a portal URL");
  return url;
}

export async function syncSubscriptionQuantity(input: {
  subscriptionId: string;
  priceId: string;
  quantity: number;
}): Promise<void> {
  const quantity = Math.max(1, Math.floor(input.quantity));
  await paddleFetch(`/subscriptions/${encodeURIComponent(input.subscriptionId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      items: [{ price_id: input.priceId, quantity }],
      proration_billing_mode: "prorated_immediately",
    }),
  });
}

export async function cancelPaddleSubscription(input: {
  subscriptionId: string;
  effectiveFrom?: "next_billing_period" | "immediately";
}): Promise<void> {
  await paddleFetch(`/subscriptions/${encodeURIComponent(input.subscriptionId)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ effective_from: input.effectiveFrom ?? "next_billing_period" }),
  });
}
