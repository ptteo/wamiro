import assert from "node:assert/strict";
import { test } from "node:test";

import { autoCloseDueAt, effectiveSlaWindows, slaDueAt, validBusinessHours } from "./policy";

test("effectiveSlaWindows falls back to defaults when no group override", () => {
  const w = effectiveSlaWindows("urgent", null);
  assert.equal(w.resolutionHours, 4);
  assert.equal(w.firstResponseHours, 1);
});

test("effectiveSlaWindows uses per-priority group overrides", () => {
  const w = effectiveSlaWindows("high", {
    slaResolutionHours: { high: 12 },
    slaFirstResponseHours: null,
  });
  assert.equal(w.resolutionHours, 12);
  assert.equal(w.firstResponseHours, 4); // default first response
});

test("effectiveSlaWindows ignores invalid override values", () => {
  const w = effectiveSlaWindows("low", {
    slaResolutionHours: { low: -3 },
    slaFirstResponseHours: { low: 99999 },
  });
  assert.equal(w.resolutionHours, 48); // default
  assert.equal(w.firstResponseHours, 24); // default (99999 out of range)
});

test("slaDueAt returns plain addition without business hours", () => {
  const from = new Date("2026-01-05T10:00:00Z");
  assert.equal(slaDueAt(from, 4, null).toISOString(), "2026-01-05T14:00:00.000Z");
});

test("slaDueAt rolls forward into the next open day (weekend skip)", () => {
  // Fri 2026-01-02 16:00 + 4h → Sat 20:00 raw; business hours Mon–Fri 09:00–17:00
  // server-local, so the deadline lands at the next open day's start.
  const from = new Date(2026, 0, 2, 16, 0); // Friday
  const due = slaDueAt(from, 4, { days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" });
  assert.equal(due.getDay() >= 1 && due.getDay() <= 5, true, "deadline must be a weekday");
  const minutes = due.getHours() * 60 + due.getMinutes();
  assert.ok(minutes >= 9 * 60 && minutes < 17 * 60, "deadline must fall inside the window");
});

test("slaDueAt keeps deadlines inside the same open window", () => {
  const from = new Date(2026, 0, 5, 10, 0); // Monday 10:00, +4h = 14:00, inside 9–17
  const due = slaDueAt(from, 4, { days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" });
  assert.equal(due.getHours(), 14);
});

test("validBusinessHours rejects malformed calendars", () => {
  assert.equal(validBusinessHours({ days: [1, 2], start: "09:00", end: "17:00" }), true);
  assert.equal(validBusinessHours({ days: [0], start: "09:00", end: "17:00" }), false);
  assert.equal(validBusinessHours({ days: [1], start: "9am", end: "17:00" }), false);
  assert.equal(validBusinessHours(null), false);
});

test("autoCloseDueAt adds whole days with a floor of one day", () => {
  const resolved = new Date("2026-01-05T12:00:00Z");
  assert.equal(autoCloseDueAt(resolved, 3).toISOString(), "2026-01-08T12:00:00.000Z");
  assert.equal(autoCloseDueAt(resolved, 0).toISOString(), "2026-01-06T12:00:00.000Z");
});
