/** Pure leave-cancellation rules — unit-tested, no DB. */

import { utcDate } from "./dates";

export { utcDate } from "./dates";

export function employeeMayWithdraw(status: string): boolean {
  return status === "pending";
}

/** Approved leave can be cancel-requested until the last day (inclusive). */
export function employeeMayRequestCancel(status: string, endDate: string, today = utcDate()): boolean {
  return status === "approved" && endDate >= today;
}

export function approverMayForceCancel(status: string): boolean {
  return status === "approved" || status === "cancel_requested";
}

export const LEAVE_QUEUE_STATUSES = ["pending", "cancel_requested"] as const;
