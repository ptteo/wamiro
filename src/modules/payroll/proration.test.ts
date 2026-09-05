import assert from "node:assert/strict";
import { test } from "node:test";

import { prorationRatio } from "./service";

test("no attendance and no leave → full month (clock-in not in use)", () => {
  assert.equal(prorationRatio({ expectedDays: 22, creditedDays: 0, hasAttendanceOrLeave: false }), 1);
});

test("unpaid-only month is not treated as full pay", () => {
  assert.equal(prorationRatio({ expectedDays: 22, creditedDays: 0, hasAttendanceOrLeave: true }), 0);
});

test("paid leave + clock-in union never exceeds 1 (no double-count)", () => {
  assert.equal(prorationRatio({ expectedDays: 20, creditedDays: 20, hasAttendanceOrLeave: true }), 1);
  assert.equal(prorationRatio({ expectedDays: 20, creditedDays: 22, hasAttendanceOrLeave: true }), 1);
});

test("partial month: 15 credited of 20 expected", () => {
  assert.equal(prorationRatio({ expectedDays: 20, creditedDays: 15, hasAttendanceOrLeave: true }), 0.75);
});

test("empty or holiday-only period → 1 (nothing to prorate)", () => {
  assert.equal(prorationRatio({ expectedDays: 0, creditedDays: 0, hasAttendanceOrLeave: false }), 1);
  assert.equal(prorationRatio({ expectedDays: 0, creditedDays: 0, hasAttendanceOrLeave: true }), 1);
});
