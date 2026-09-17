import assert from "node:assert/strict";
import { test } from "node:test";

import { prorationRatio } from "./service";
import { isWorkday } from "./workweek";

test("G-17: default workweek is Mon–Fri", () => {
  const monFri = ["1", "2", "3", "4", "5"];
  assert.equal(isWorkday(new Date("2026-09-14T12:00:00Z"), monFri, "UTC"), true); // Monday
  assert.equal(isWorkday(new Date("2026-09-18T12:00:00Z"), monFri, "UTC"), true); // Friday
  assert.equal(isWorkday(new Date("2026-09-19T12:00:00Z"), monFri, "UTC"), false); // Saturday
  assert.equal(isWorkday(new Date("2026-09-20T12:00:00Z"), monFri, "UTC"), false); // Sunday
});

test("G-17: Sun–Thu workweek (Middle East calendar)", () => {
  const sunThu = ["7", "1", "2", "3", "4"];
  assert.equal(isWorkday(new Date("2026-09-20T12:00:00Z"), sunThu, "UTC"), true); // Sunday
  assert.equal(isWorkday(new Date("2026-09-18T12:00:00Z"), sunThu, "UTC"), false); // Friday
});

test("G-17: local weekday honors the org timezone, not UTC", () => {
  // 2026-09-19T02:00Z is Saturday 02:00 UTC, but Friday 19:00 in UTC-7:
  // a Mon–Fri org in that timezone MUST count it as a workday.
  const satUtc = new Date("2026-09-19T02:00:00Z");
  assert.equal(isWorkday(satUtc, ["1", "2", "3", "4", "5"], "UTC"), false);
  assert.equal(isWorkday(satUtc, ["1", "2", "3", "4", "5"], "Etc/GMT+7"), true);
});

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
