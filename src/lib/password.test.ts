import assert from "node:assert/strict";
import { test } from "node:test";

import { hashPassword, hashToken, verifyPassword } from "./password";

test("hash + verify roundtrip", async () => {
  const h = await hashPassword("correct horse battery staple");
  assert.ok(h.startsWith("scrypt$"));
  assert.equal(await verifyPassword("correct horse battery staple", h), true);
});

test("wrong password fails; malformed stored hash fails safely", async () => {
  const h = await hashPassword("secret-password");
  assert.equal(await verifyPassword("wrong-password", h), false);
  assert.equal(await verifyPassword("secret-password", "garbage"), false);
  assert.equal(await verifyPassword("secret-password", "scrypt$$"), false);
});

test("same password hashes differently (unique salts)", async () => {
  const [a, b] = await Promise.all([hashPassword("same"), hashPassword("same")]);
  assert.notEqual(a, b);
});

test("token hashing is sha256 hex and deterministic", () => {
  const t = hashToken("token-value");
  assert.match(t, /^[a-f0-9]{64}$/);
  assert.equal(hashToken("token-value"), t);
});
