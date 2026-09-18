import assert from "node:assert/strict";
import { test } from "node:test";

import { RateAggregator } from "./ratelimit.js";

test("aggregator batches hits per (scope,key,window) into one delta", async () => {
  const agg = new RateAggregator();
  agg.add("org", "org-1", 100);
  agg.add("org", "org-1", 100);
  agg.add("org", "org-1", 100);
  agg.add("ip", "1.2.3.4", 100);
  assert.equal(agg.peek("org", "org-1", 100), 3);
  assert.equal(agg.peek("ip", "1.2.3.4", 100), 1);
  assert.equal(agg.empty, false);

  const flushed: { key: string; delta: number; windowStart: number }[] = [];
  await agg.flush(async (entries) => {
    for (const e of entries) flushed.push({ key: e.key, delta: e.delta, windowStart: e.windowStart });
  });
  assert.equal(flushed.length, 2);
  assert.deepEqual(flushed.find((f) => f.key === "org-1"), { key: "org-1", delta: 3, windowStart: 100 });
  assert.equal(agg.empty, true);
});

test("flush re-buffers entries whose flusher threw (no hit loss)", async () => {
  const agg = new RateAggregator();
  agg.add("org", "org-1", 100);
  agg.add("org", "org-1", 100);
  await assert.rejects(
    () =>
      agg.flush(async () => {
        throw new Error("db down");
      }),
    /db down/,
  );
  // still buffered, still counted
  assert.equal(agg.peek("org", "org-1", 100), 2);
  const seen: number[] = [];
  await agg.flush(async (entries) => {
    for (const e of entries) seen.push(e.delta);
  });
  assert.deepEqual(seen, [2]);
});

test("capacity guard drops the oldest entry instead of growing forever", () => {
  const agg = new RateAggregator(3);
  agg.add("ip", "a", 1);
  agg.add("ip", "b", 1);
  agg.add("ip", "c", 1);
  agg.add("ip", "d", 1); // evicts "a"
  assert.equal(agg.peek("ip", "a", 1), 0);
  assert.equal(agg.peek("ip", "d", 1), 1);
});

test("remove() drops a buffered entry (synchronous-write handoff)", async () => {
  const agg = new RateAggregator();
  agg.add("org", "org-1", 100);
  agg.remove("org", "org-1", 100);
  assert.equal(agg.empty, true);
  const calls: unknown[] = [];
  await agg.flush(async (entries) => {
    calls.push(...entries);
  });
  assert.equal(calls.length, 0);
});

test("distinct windows buffer separately", () => {
  const agg = new RateAggregator();
  agg.add("org", "org-1", 100);
  agg.add("org", "org-1", 200);
  assert.equal(agg.peek("org", "org-1", 100), 1);
  assert.equal(agg.peek("org", "org-1", 200), 1);
});
