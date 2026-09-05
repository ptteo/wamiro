import assert from "node:assert/strict";
import { createDecipheriv, createHmac, createPublicKey, diffieHellman, generateKeyPairSync, randomBytes, type KeyObject } from "node:crypto";
import { test } from "node:test";

import { encryptForSubscription, signVapidJwt, verifyVapidJwt } from "./push";

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}
function rawPoint(pub: KeyObject): Buffer {
  const jwk = pub.export({ format: "jwk" }) as { x?: string; y?: string };
  return Buffer.concat([Buffer.from([0x04]), Buffer.from(jwk.x ?? "", "base64url"), Buffer.from(jwk.y ?? "", "base64url")]);
}
function ecPublicFromRaw(raw: Buffer) {
  return createPublicKey({
    key: { kty: "EC", crv: "P-256", x: raw.subarray(1, 33).toString("base64url"), y: raw.subarray(33, 65).toString("base64url") },
    format: "jwk",
  });
}

/**
 * UA-side decryption, implemented straight from RFC 8291 §3.3/3.4 (plain
 * HMAC, mirroring the pseudocode) rather than reusing the library helpers —
 * a genuine cross-check of the sender's derivation.
 */
function decryptAsUserAgent(body: Buffer, uaPrivate: KeyObject, uaRaw: Buffer, authSecret: Buffer): Buffer {
  assert.equal(body[0], 65, "keyid length octet = 65 (uncompressed point)");
  const serverRaw = body.subarray(1, 66);
  const salt = body.subarray(66, 82);
  const rs = body.readUInt32BE(82);
  assert.ok(rs >= 4096, "rs is at least 4096");
  const header = body.subarray(0, 86);
  const ciphertext = body.subarray(86);

  const ecdhSecret = Buffer.from(
    diffieHellman({ privateKey: uaPrivate, publicKey: ecPublicFromRaw(serverRaw) }),
  );

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info", "utf8"), Buffer.from([0x00]), uaRaw, serverRaw]);
  const prkKey = createHmac("sha256", authSecret).update(ecdhSecret).digest();
  const ikm = createHmac("sha256", prkKey).update(Buffer.concat([keyInfo, Buffer.from([0x01])])).digest();
  const prk = createHmac("sha256", salt).update(ikm).digest();
  const cek = createHmac("sha256", prk)
    .update(Buffer.concat([Buffer.from("Content-Encoding: aes128gcm", "utf8"), Buffer.from([0x00]), Buffer.from([0x01])]))
    .digest()
    .subarray(0, 16);
  const nonce = createHmac("sha256", prk)
    .update(Buffer.concat([Buffer.from("Content-Encoding: nonce", "utf8"), Buffer.from([0x00]), Buffer.from([0x01])]))
    .digest()
    .subarray(0, 12);

  const tag = ciphertext.subarray(ciphertext.length - 16);
  const data = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce, { authTagLength: 16 });
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  // Strip the final-record padding delimiter (0x02) that the sender appends.
  assert.equal(plain[plain.length - 1], 0x02, "ends with the RFC 8188 final-record delimiter");
  return plain.subarray(0, plain.length - 1);
}

test("aes128gcm push payload round-trips to the user agent (RFC 8291)", () => {
  const ua = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const uaRaw = rawPoint(ua.publicKey);
  const authSecret = randomBytes(16);

  const message = JSON.stringify({ title: "Leave approved", body: "Your annual leave was approved.", url: "/leave" });
  const body = encryptForSubscription(b64url(uaRaw), b64url(authSecret), Buffer.from(message, "utf8"));

  const plain = decryptAsUserAgent(body, ua.privateKey, uaRaw, authSecret);
  assert.equal(plain.toString("utf8"), message);
});

test("different messages and keys produce different ciphertexts", () => {
  const ua1 = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const a1 = randomBytes(16);
  const m = JSON.stringify({ title: "hi" });
  const b1 = encryptForSubscription(b64url(rawPoint(ua1.publicKey)), b64url(a1), Buffer.from(m));
  const b2 = encryptForSubscription(b64url(rawPoint(ua1.publicKey)), b64url(a1), Buffer.from(m));
  assert.notDeepEqual(b1, b2, "salt + ephemeral key must randomize the body");
  // Both still decrypt.
  assert.equal(decryptAsUserAgent(b2, ua1.privateKey, rawPoint(ua1.publicKey), a1).toString(), m);
});

function vapidKeyPair() {
  const kp = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pubJwk = kp.publicKey.export({ format: "jwk" }) as { x?: string; y?: string };
  const raw = Buffer.concat([Buffer.from([0x04]), Buffer.from(pubJwk.x ?? "", "base64url"), Buffer.from(pubJwk.y ?? "", "base64url")]);
  const privatePem = kp.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicPem = kp.publicKey.export({ type: "spki", format: "pem" }).toString();
  return { privatePem, publicPem, publicB64: raw.toString("base64url") };
}

test("VAPID JWT signs and verifies; wrong audience is rejected", () => {
  const { privatePem, publicPem } = vapidKeyPair();
  const now = Math.floor(Date.now() / 1000);
  const jwt = signVapidJwt({ privateKeyPem: privatePem, audience: "https://push.example", subject: "mailto:ops@wamiro.app", nowSec: now });

  assert.ok(verifyVapidJwt({ jwt, publicKeyPem: publicPem, expectedAudience: "https://push.example" }), "valid token verifies");
  assert.ok(!verifyVapidJwt({ jwt, publicKeyPem: publicPem, expectedAudience: "https://evil.example" }), "audience mismatch fails");
  const tampered = jwt.slice(0, -8) + "AAAAAA==";
  assert.ok(!verifyVapidJwt({ jwt: tampered, publicKeyPem: publicPem, expectedAudience: "https://push.example" }), "tampered signature fails");
});