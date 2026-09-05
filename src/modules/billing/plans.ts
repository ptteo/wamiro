/**
 * Plan catalog (multi-tenant commercialization).
 *
 * Tiers were calibrated against the workforce-OS market (Connecteam, Happeo,
 * Workvivo, Jostle et al. all sell per-user/month with a small free tier and
 * plan-gated modules):
 *
 *   Starter  — free, up to 10 seats, core communication + HR modules
 *   Growth   — per-seat, most modules, analytics + payroll + priorities
 *   Scale    — per-seat enterprise, unlimited seats, everything (SSO: later)
 *
 * New organizations always start on Starter (billing_status = active) so the
 * product is instantly usable; platform operators grant paid plans / trials.
 */
export interface PlanDef {
  id: string;
  name: string;
  tagline: string;
  /** NULL = unlimited. */
  seatLimit: number | null;
  /** Per-seat per-month USD list price (display only until billing wired). */
  monthlyPerSeat: number | null;
  /** Days of free trial offered when this plan is granted. */
  trialDays: number;
  /** Human list of included capabilities shown on the billing page. */
  highlights: string[];
  /** True when the plan unlocks analytics + payroll engines. */
  advanced: boolean;
}

export const PLANS: Record<string, PlanDef> = {
  starter: {
    id: "starter",
    name: "Starter",
    tagline: "For small teams getting organised",
    seatLimit: 10,
    monthlyPerSeat: 0,
    trialDays: 0,
    advanced: false,
    highlights: [
      "Up to 10 employees",
      "People directory, teams & org chart",
      "Requests, approvals & service catalog",
      "Announcements, discussions & knowledge",
      "Core support tickets + SLA",
      "Email support",
    ],
  },
  growth: {
    id: "growth",
    name: "Growth",
    tagline: "For growing companies running on Wamiro",
    seatLimit: 50,
    monthlyPerSeat: 4,
    trialDays: 14,
    advanced: true,
    highlights: [
      "Up to 50 employees",
      "Everything in Starter",
      "Attendance, shifts, leave & payroll",
      "HR analytics & support reporting",
      "Salary advances & encashment",
      "Priority support",
    ],
  },
  scale: {
    id: "scale",
    name: "Scale",
    tagline: "For larger organisations & distributed teams",
    seatLimit: null,
    monthlyPerSeat: 7,
    trialDays: 14,
    advanced: true,
    highlights: [
      "Unlimited employees",
      "Everything in Growth",
      "Agent toolkit, mailboxes & IT records",
      "Dedicated success manager",
      "SSO & advanced security (roadmap)",
    ],
  },
};

export type PlanId = "starter" | "growth" | "scale";

export function planOf(plan: string | null | undefined): PlanDef {
  return PLANS[plan ?? ""] ?? PLANS.starter!;
}

/**
 * Effective seat limit for an org: an explicit override wins; otherwise the
 * plan's limit applies. NULL means unlimited.
 */
export function effectiveSeatLimit(plan: string | null | undefined, seatLimit: number | null | undefined): number | null {
  if (seatLimit !== null && seatLimit !== undefined) return seatLimit;
  return planOf(plan).seatLimit;
}
