import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SLA_FIRST_RESPONSE_HOURS,
  SLA_RESOLUTION_HOURS,
  slaBucketOf,
  slaStateOf,
  type SlaInput,
} from "./service";

const h = (n: number) => n * 3_600_000;

function make(
  overrides: Partial<SlaInput> = {},
  now: Date = new Date("2026-09-04T12:00:00Z"),
): SlaInput {
  const createdAt = new Date(now.getTime() - h(2));
  return {
    status: "open",
    slaDueDate: new Date(now.getTime() + h(24)), // created 2h ago → 22h remaining
    resolvedAt: null,
    createdAt,
    ...overrides,
  };
}

test("defaults per priority: resolution and first-response windows", () => {
  assert.equal(SLA_RESOLUTION_HOURS.urgent, 4);
  assert.equal(SLA_FIRST_RESPONSE_HOURS.urgent, 1);
  assert.equal(SLA_RESOLUTION_HOURS.low, 48);
  assert.equal(SLA_FIRST_RESPONSE_HOURS.low, 24);
});

test("open ticket well within window is ok / healthy", () => {
  const now = new Date("2026-09-04T12:00:00Z");
  const t = make({}, now);
  assert.equal(slaStateOf(t, now), "ok");
  assert.equal(slaBucketOf(t, now), "healthy");
});

test("open ticket past deadline is breached", () => {
  const t = make({ slaDueDate: new Date(Date.now() - h(1)) });
  assert.equal(slaStateOf(t), "breached");
  assert.equal(slaBucketOf(t), "breached");
});

test("open ticket with less than 25% window remaining is at_risk", () => {
  // 26h total window, created 22h ago → ~4h (15%) remaining
  const now = new Date("2026-09-04T12:00:00Z");
  const createdAt = new Date(now.getTime() - h(22));
  const t = make({ createdAt, slaDueDate: new Date(now.getTime() + h(4)) }, now);
  assert.equal(slaStateOf(t, now), "at_risk");
  assert.equal(slaBucketOf(t, now), "at_risk");
});

test("open ticket with 25–50% remaining is due_soon (still ok state)", () => {
  const now = new Date("2026-09-04T12:00:00Z");
  const createdAt = new Date(now.getTime() - h(14)); // 26h window, 12h left ≈ 46%
  const t = make({ createdAt, slaDueDate: new Date(now.getTime() + h(12)) }, now);
  assert.equal(slaBucketOf(t, now), "due_soon");
  assert.equal(slaStateOf(t, now), "ok");
});

test("resolved before deadline is ok; resolved late is breached", () => {
  const onTime = make({ status: "resolved", resolvedAt: new Date(Date.now() - h(2)) });
  assert.equal(slaStateOf(onTime), "ok");
  const late = make({
    status: "resolved",
    slaDueDate: new Date(Date.now() - h(5)),
    resolvedAt: new Date(Date.now() - h(1)),
  });
  assert.equal(slaStateOf(late), "breached");
});

test("closed tickets never show breached", () => {
  const closed = make({ status: "closed", slaDueDate: new Date(Date.now() - h(5)) });
  assert.equal(slaStateOf(closed), "ok");
  assert.equal(slaBucketOf(closed), "healthy");
});

test("missing SLA deadline is always ok", () => {
  const t = make({ slaDueDate: null });
  assert.equal(slaStateOf(t), "ok");
  assert.equal(slaBucketOf(t), "healthy");
});