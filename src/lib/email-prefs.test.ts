import assert from "node:assert/strict";
import { test } from "node:test";

import { emailKindAllowed, groupDigest, inQuietHours } from "./email-prefs";

test("quiet hours same-day window", () => {
  const hours = { start: "09:00", end: "17:00", tz: "UTC" };
  assert.equal(inQuietHours(new Date("2026-06-01T10:00:00Z"), hours), true);
  assert.equal(inQuietHours(new Date("2026-06-01T08:00:00Z"), hours), false);
});

test("quiet hours overnight window", () => {
  const hours = { start: "22:00", end: "07:00", tz: "UTC" };
  assert.equal(inQuietHours(new Date("2026-06-01T23:00:00Z"), hours), true);
  assert.equal(inQuietHours(new Date("2026-06-01T06:00:00Z"), hours), true);
  assert.equal(inQuietHours(new Date("2026-06-01T12:00:00Z"), hours), false);
});

test("kind allow-list defaults to on", () => {
  assert.equal(emailKindAllowed(undefined, "leave"), true);
  assert.equal(emailKindAllowed({ kinds: { leave: false } }, "leave"), false);
  assert.equal(emailKindAllowed({ kinds: { leave: false } }, "ticket"), true);
  assert.equal(emailKindAllowed({ kinds: { leave: false } }, "leave.approved"), false);
});

test("digest grouping", () => {
  const g = groupDigest([
    { type: "leave", title: "A" },
    { type: "leave", title: "B" },
    { type: "ticket", title: "C" },
  ]);
  assert.equal(g.find((x) => x.type === "leave")?.count, 2);
  assert.equal(g.find((x) => x.type === "ticket")?.sample, "C");
});
