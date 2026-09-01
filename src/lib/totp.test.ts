import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

import { generateSecret, provisioningUri, verifyTotp } from "./totp";

/** Independent HOTP mirror — what a correct authenticator app shows. */
function codeFor(secret: string, counter: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secret) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter % 2 ** 32, 4);
  const hmac = createHmac("sha1", Buffer.from(bytes)).update(buf).digest();
  const off = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[off]! & 0x7f) << 24) |
    ((hmac[off + 1]! & 0xff) << 16) |
    ((hmac[off + 2]! & 0xff) << 8) |
    (hmac[off + 3]! & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

const nowCode = (secret: string, offsetSteps = 0) =>
  codeFor(secret, Math.floor(Date.now() / 30_000) + offsetSteps);

test("secret is base32 and RFC-recommended length", () => {
  assert.match(generateSecret(), /^[A-Z2-7]{32}$/);
});

test("current code verifies; ±30s skew accepted; wrong/malformed rejected", () => {
  const secret = generateSecret();
  assert.equal(verifyTotp(secret, nowCode(secret)), true);
  assert.equal(verifyTotp(secret, nowCode(secret, -1)), true);
  assert.equal(verifyTotp(secret, nowCode(secret, 7)), false); // outside window
  assert.equal(verifyTotp(secret, "abc"), false);
});

test("provisioning URI shape", () => {
  const uri = provisioningUri("a@b.c", "JBSWY3DPEHPK3PXP");
  assert.match(uri, /^otpauth:\/\/totp\/Wamiro%3Aa%40b\.c\?secret=JBSWY3DPEHPK3PXP&issuer=Wamiro/);
});
