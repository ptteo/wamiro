import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertDateInBounds,
  assertTimestampRangeInBounds,
  DATE_FLOOR_MS,
  MAX_FUTURE_DAYS,
  parseIsoDate,
} from "@/lib/date-bounds";
import { ApiError } from "@/lib/errors";

test("parseIsoDate accepts real dates and rejects impossible ones", () => {
  assert.equal(parseIsoDate("2026-02-14").toISOString(), "2026-02-14T00:00:00.000Z");
  assert.throws(() => parseIsoDate("2026-02-31"), /not a real calendar date/);
  assert.throws(() => parseIsoDate("2026-13-01"), /not a real calendar date/);
  assert.throws(() => parseIsoDate("26-02-01"), /YYYY-MM-DD/);
  assert.throws(() => parseIsoDate("20260214"), /YYYY-MM-DD/);
});

test("assertDateInBounds rejects far past, far future, and passes sane dates", () => {
  assert.equal(assertDateInBounds("2026-09-17", "log date"), "2026-09-17");
  assert.throws(() => assertDateInBounds("1975-06-01"), /too far in the past/);
  const farFuture = new Date(Date.now() + (MAX_FUTURE_DAYS + 10) * 86_400_000).toISOString().slice(0, 10);
  assert.throws(() => assertDateInBounds(farFuture), /too far in the future/);
  // the future window boundary itself is accepted
  const edge = new Date(Date.now() + (MAX_FUTURE_DAYS - 5) * 86_400_000).toISOString().slice(0, 10);
  assert.equal(assertDateInBounds(edge), edge);
});

test("DATE_FLOOR_MS is 2000-01-01 UTC", () => {
  assert.equal(new Date(DATE_FLOOR_MS).toISOString().slice(0, 10), "2000-01-01");
});

test("assertTimestampRangeInBounds validates ordering and window", () => {
  const now = Date.now();
  const okStart = new Date(now + 3_600_000);
  const okEnd = new Date(now + 7_200_000);
  assertTimestampRangeInBounds(okStart, okEnd);

  // end <= start
  assert.throws(() => assertTimestampRangeInBounds(okEnd, okStart), /end after it starts/);
  // invalid timestamps
  assert.throws(() => assertTimestampRangeInBounds(new Date("nope"), okEnd), /valid timestamps/);
  // far past
  assert.throws(
    () => assertTimestampRangeInBounds(new Date(DATE_FLOOR_MS - 86_400_000), okEnd),
    /too far in the past/,
  );
  // far future
  const far = new Date(now + (MAX_FUTURE_DAYS + 30) * 86_400_000);
  assert.throws(() => assertTimestampRangeInBounds(okStart, far), /too far in the future/);
});

test("ApiError from helpers is a 400-class validation error", () => {
  try {
    assertDateInBounds("1970-01-01");
    assert.fail("should have thrown");
  } catch (e) {
    assert.ok(e instanceof ApiError);
    assert.equal((e as ApiError).status, 400);
  }
});
