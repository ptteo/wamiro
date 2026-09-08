import assert from "node:assert/strict";
import { test } from "node:test";

import {
  paddleSignatureHex,
  parsePaddleSignature,
  verifyPaddleSignature,
} from "./paddle-sign";
import { mapPaddleSubscriptionStatus } from "./status";

const SECRET = "pdl_ntf_test_secret";
const BODY = JSON.stringify({ event_id: "evt_01", event_type: "subscription.updated" });

test("parsePaddleSignature reads ts and one or more h1 hashes", () => {
  const one = parsePaddleSignature("ts=1700000000;h1=abcDEF");
  assert.deepEqual(one, { ts: "1700000000", h1: ["abcdef"] });
  const two = parsePaddleSignature("ts=1;h1=aaa;h1=bbb");
  assert.deepEqual(two, { ts: "1", h1: ["aaa", "bbb"] });
  assert.equal(parsePaddleSignature(""), null);
  assert.equal(parsePaddleSignature("nope"), null);
});

test("verifyPaddleSignature accepts a matching HMAC within the skew window", () => {
  const ts = "1700000000";
  const nowMs = 1_700_000_000_000;
  const h1 = paddleSignatureHex(SECRET, ts, BODY);
  assert.equal(verifyPaddleSignature(`ts=${ts};h1=${h1}`, BODY, SECRET, nowMs), true);
});

test("verifyPaddleSignature rejects a tampered body", () => {
  const ts = "1700000000";
  const nowMs = 1_700_000_000_000;
  const h1 = paddleSignatureHex(SECRET, ts, BODY);
  assert.equal(verifyPaddleSignature(`ts=${ts};h1=${h1}`, BODY + "x", SECRET, nowMs), false);
});

test("verifyPaddleSignature rejects a wrong secret", () => {
  const ts = "1700000000";
  const nowMs = 1_700_000_000_000;
  const h1 = paddleSignatureHex(SECRET, ts, BODY);
  assert.equal(verifyPaddleSignature(`ts=${ts};h1=${h1}`, BODY, "other", nowMs), false);
});

test("verifyPaddleSignature rejects timestamps outside 5 minutes", () => {
  const ts = "1700000000";
  const h1 = paddleSignatureHex(SECRET, ts, BODY);
  const header = `ts=${ts};h1=${h1}`;
  assert.equal(verifyPaddleSignature(header, BODY, SECRET, 1_700_000_000_000 + 5 * 60_000 + 1), false);
  assert.equal(verifyPaddleSignature(header, BODY, SECRET, 1_700_000_000_000 - 5 * 60_000 - 1), false);
  assert.equal(verifyPaddleSignature(header, BODY, SECRET, 1_700_000_000_000 + 4 * 60_000), true);
});

test("verifyPaddleSignature accepts any matching h1 (secret rotation)", () => {
  const ts = "1700000000";
  const nowMs = 1_700_000_000_000;
  const good = paddleSignatureHex(SECRET, ts, BODY);
  assert.equal(verifyPaddleSignature(`ts=${ts};h1=deadbeef;h1=${good}`, BODY, SECRET, nowMs), true);
});

test("mapPaddleSubscriptionStatus covers the lifecycle we persist", () => {
  assert.equal(mapPaddleSubscriptionStatus("active"), "active");
  assert.equal(mapPaddleSubscriptionStatus("trialing"), "trial");
  assert.equal(mapPaddleSubscriptionStatus("past_due"), "past_due");
  assert.equal(mapPaddleSubscriptionStatus("paused"), "past_due");
  assert.equal(mapPaddleSubscriptionStatus("canceled"), "cancelled");
  assert.equal(mapPaddleSubscriptionStatus("cancelled"), "cancelled");
  assert.equal(mapPaddleSubscriptionStatus("nope"), null);
});
