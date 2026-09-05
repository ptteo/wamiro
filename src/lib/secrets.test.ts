import assert from "node:assert/strict";
import { test } from "node:test";

import { decryptSecret, encryptSecret, reencrypt } from "./secrets";

test("encrypt/decrypt roundtrip", () => {
  const secret = "imap-password-example";
  const sealed = encryptSecret(secret);
  assert.match(sealed, /^v1:/);
  assert.notEqual(sealed, secret);
  assert.equal(decryptSecret(sealed), secret);
});

test("legacy plaintext passes through decrypt (in-place migration)", () => {
  assert.equal(decryptSecret("already-plaintext"), "already-plaintext");
  assert.equal(decryptSecret(""), "");
});

test("reencrypt upgrades plaintext and leaves v1 blobs alone", () => {
  const once = reencrypt("plain");
  assert.match(once, /^v1:/);
  assert.equal(reencrypt(once), once);
  assert.equal(decryptSecret(once), "plain");
});
