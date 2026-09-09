import assert from "node:assert/strict";
import { test } from "node:test";

import { carryForwardDays, encashableDays, monthsElapsedThisYear, projectedEntitlement, round1 } from "./accrual";

test("projectedEntitlement accrues monthly with elapsed-month floor", () => {
  assert.equal(projectedEntitlement({ accrualPerMonth: 1.5, annualQuotaDays: 18 }, 4), 6);
  assert.equal(projectedEntitlement({ accrualPerMonth: null, annualQuotaDays: 18 }, 4), 18);
  assert.equal(projectedEntitlement({ accrualPerMonth: 2, annualQuotaDays: 18 }, 12), 18, "capped at annual quota");
});

test("monthsElapsedThisYear counts completed months (0-based, UTC-safe)", () => {
  // June 15 → Jan–May complete → 5
  assert.equal(monthsElapsedThisYear(new Date(Date.UTC(2026, 5, 15))), 5);
  // Dec 31 → Jan–Nov complete → 11
  assert.equal(monthsElapsedThisYear(new Date(Date.UTC(2026, 11, 31))), 11);
});

test("carryForwardDays respects the cap and zero/no-cap semantics", () => {
  assert.equal(carryForwardDays(10, 3), 3);
  assert.equal(carryForwardDays(2, 5), 2);
  assert.equal(carryForwardDays(10, null), 0);
  assert.equal(carryForwardDays(10, 0), 0);
});

test("encashableDays never exceeds remaining balance", () => {
  assert.equal(encashableDays(10, 5, 20, null), 5);
  assert.equal(encashableDays(30, 25, 20, null), 20, "type cap binds");
  assert.equal(encashableDays(30, 25, null, 22), 22, "org cap binds when type cap is null");
  assert.equal(encashableDays(30, 25, null, null), 25, "no cap → balance binds");
  assert.equal(encashableDays(0, 5, 20, null), 0);
});

test("round1 halves and floors rounding", () => {
  assert.equal(round1(1.25), 1.3);
  assert.equal(round1(1.24), 1.2);
});
