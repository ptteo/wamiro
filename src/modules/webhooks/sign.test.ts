import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

import { signPayload } from "./service";

test("signPayload produces a deterministic sha256 HMAC with the standard prefix", () => {
  const secret = "s3cr3t";
  const body = JSON.stringify({ hello: "world" });
  const sig = signPayload(secret, body);
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  assert.equal(sig, expected);
  assert.ok(sig.startsWith("sha256="), "signature uses the GitHub-style prefix");
});

test("signature changes when the body changes (tamper detection)", () => {
  const secret = "s3cr3t";
  const a = signPayload(secret, "payload-a");
  const b = signPayload(secret, "payload-b");
  assert.notEqual(a, b);
});

test("different secrets produce different signatures for the same body", () => {
  assert.notEqual(signPayload("one", "body"), signPayload("two", "body"));
});