import assert from "node:assert/strict";
import { test } from "node:test";

import { isSignatureFresh, nextRetryDelayMs, SIGNATURE_MAX_AGE_MS } from "./service.js";

test("retry backoff doubles from 30s and caps at 1h", () => {
  assert.equal(nextRetryDelayMs(1), 30_000);
  assert.equal(nextRetryDelayMs(2), 60_000);
  assert.equal(nextRetryDelayMs(3), 120_000);
  assert.equal(nextRetryDelayMs(4), 240_000);
  assert.equal(nextRetryDelayMs(6), 960_000);
  assert.equal(nextRetryDelayMs(20), 3_600_000); // cap
});

test("signature freshness window is 5 minutes and symmetric", () => {
  assert.equal(SIGNATURE_MAX_AGE_MS, 300_000);
  const now = 1_700_000_000_000;
  assert.equal(isSignatureFresh(now, now), true);
  assert.equal(isSignatureFresh(now - 60_000, now), true); // 1 min old: ok
  assert.equal(isSignatureFresh(now - 301_000, now), false); // past window
  assert.equal(isSignatureFresh(now + 301_000, now), false); // future skew past window
});
