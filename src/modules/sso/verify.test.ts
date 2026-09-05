import { createPublicKey, createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";

import { toPem, verifyIdToken } from "./service";

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

// ---------------------------------------------------------------------------
// DER parsing helpers (test-only)
// ---------------------------------------------------------------------------

interface DerElement {
  tag: number;
  body: Buffer; // full content octets (children for constructed tags)
  children: DerElement[];
}

/** Minimal recursive DER parser — the SPKI we parse is small and simple. */
function parseDer(buf: Buffer, start = 0, end = buf.length): DerElement[] {
  const out: DerElement[] = [];
  let i = start;
  while (i < end) {
    const tag = buf[i] as number;
    i += 1;
    let len = buf[i] as number;
    i += 1;
    if ((len & 0x80) !== 0) {
      const n = len & 0x7f;
      len = 0;
      for (let k = 0; k < n; k++) {
        len = len * 256 + (buf[i] as number);
        i += 1;
      }
    }
    const body = buf.subarray(i, i + len);
    i += len;
    const constructed = (tag & 0x20) !== 0;
    out.push({ tag, body, children: constructed ? parseDer(body) : [] });
  }
  return out;
}

function stripLeadingZero(b: Buffer): Buffer {
  return b[0] === 0 ? b.subarray(1) : b;
}

/** Parse an SPKI DER RSA public key into { kty, n, e } (base64url). */
function derToRsaJwk(der: Buffer): { kty: string; n: string; e: string } {
  // SPKI: SEQUENCE { SEQUENCE { OID, NULL }, BIT STRING { SEQUENCE { INTEGER n, INTEGER e } } }
  const outer = parseDer(der)[0]!;
  const bitString = outer.children[1]!;
  const inner = parseDer(bitString.body.subarray(1))[0]!; // drop unused-bits byte
  const n = stripLeadingZero(inner.children[0]!.body);
  const e = stripLeadingZero(inner.children[1]!.body);
  return { kty: "RSA", n: b64url(n), e: b64url(e) };
}

/** Parse an SPKI DER EC public key (P-256) into { kty, crv, x, y }. */
function derToEcJwk(der: Buffer): { kty: string; crv: string; x: string; y: string } {
  // SPKI: SEQUENCE { SEQUENCE { OID(ecPublicKey), OID(prime256v1) }, BIT STRING { 0x04 || x || y } }
  const outer = parseDer(der)[0]!;
  const bitString = outer.children[1]!;
  const point = bitString.body.subarray(1);
  return { kty: "EC", crv: "P-256", x: b64url(point.subarray(1, 33)), y: b64url(point.subarray(33, 65)) };
}

// ---------------------------------------------------------------------------
// JWT builders (test-only)
// ---------------------------------------------------------------------------

function signJwt(header: Record<string, unknown>, payload: Record<string, unknown>, privateKey: KeyObject, alg: string): string {
  const h = b64url(Buffer.from(JSON.stringify(header)));
  const p = b64url(Buffer.from(JSON.stringify(payload)));
  const data: Buffer = Buffer.from(`${h}.${p}`, "utf8");
  const signer = createSign(alg === "ES256" ? "sha256" : "RSA-SHA256");
  signer.update(data as unknown as Parameters<typeof signer.update>[0]);
  signer.end();
  const rawSig = signer.sign(privateKey);
  const sig: Buffer = rawSig ?? Buffer.alloc(0);
  const finalSig = alg === "ES256" ? derToRawEcdsa(sig, 32) : sig;
  return `${h}.${p}.${b64url(finalSig)}`;
}

/** Convert a DER ECDSA signature to raw r||s (JWT format). */
function derToRawEcdsa(der: Buffer, size: number): Buffer {
  const seq = parseDer(der)[0]!;
  const trim = (b: Buffer): Buffer => {
    let v = b;
    while (v.length > 0 && v[0] === 0) v = v.subarray(1);
    return v;
  };
  const pad = (b: Buffer): Buffer => (b.length >= size ? b : Buffer.concat([Buffer.alloc(size - b.length), b]));
  const r = pad(trim(seq.children[0]!.body));
  const s = pad(trim(seq.children[1]!.body));
  return Buffer.concat([r, s]);
}

function makeRsaPair() {
  return generateKeyPairSync("rsa", { modulusLength: 2048 });
}

function rsaJwk(pub: KeyObject) {
  return { ...derToRsaJwk(pub.export({ type: "spki", format: "der" }) as Buffer), kid: "rsa-1", use: "sig", alg: "RS256" };
}

function ecJwk(pub: KeyObject) {
  return { ...derToEcJwk(pub.export({ type: "spki", format: "der" }) as Buffer), kid: "ec-1", use: "sig", alg: "ES256" };
}

function withJwks(jwksUri: string, keys: object[], fn: () => Promise<void>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (String(input) === jwksUri) {
      return new Response(JSON.stringify({ keys }), { status: 200 });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  return fn().finally(() => {
    globalThis.fetch = originalFetch;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("verifyIdToken accepts a valid RS256 token", async () => {
  const { publicKey, privateKey } = makeRsaPair();
  void privateKey;
  const jwksUri = "https://idp.example/jwks";
  await withJwks(jwksUri, [rsaJwk(publicKey)], async () => {
    const token = signJwt(
      { alg: "RS256", kid: "rsa-1", typ: "JWT" },
      { iss: "https://idp.example", aud: "wamiro-client", sub: "u-1", email: "a@b.co", nonce: "n-1", exp: Math.floor(Date.now() / 1000) + 300 },
      privateKey,
      "RS256",
    );
    const claims = await verifyIdToken(token, "https://idp.example", "wamiro-client", "n-1", jwksUri);
    assert.equal(claims.email, "a@b.co");
    assert.equal(claims.sub, "u-1");
  });
});

test("verifyIdToken accepts a valid ES256 token (P-256)", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  void privateKey;
  const jwksUri = "https://idp.example/jwks-es";
  await withJwks(jwksUri, [ecJwk(publicKey)], async () => {
    const token = signJwt(
      { alg: "ES256", kid: "ec-1", typ: "JWT" },
      { iss: "https://idp.example", aud: "wamiro-client", sub: "u-2", email: "b@c.io", nonce: "n-2", exp: Math.floor(Date.now() / 1000) + 300 },
      privateKey,
      "ES256",
    );
    const claims = await verifyIdToken(token, "https://idp.example", "wamiro-client", "n-2", jwksUri);
    assert.equal(claims.email, "b@c.io");
  });
});

test("verifyIdToken rejects wrong nonce, wrong issuer, wrong audience, expired token, and a tampered signature", async () => {
  const { publicKey, privateKey } = makeRsaPair();
  const jwksUri = "https://idp.example/jwks-tamper";
  await withJwks(jwksUri, [rsaJwk(publicKey)], async () => {
    const base = { iss: "https://idp.example", aud: "wamiro-client", sub: "u-3", email: "c@d.net", nonce: "n-3", exp: Math.floor(Date.now() / 1000) + 300 };
    const mk = (payload: Record<string, unknown>) => signJwt({ alg: "RS256", kid: "rsa-1" }, payload, privateKey, "RS256");

    await assert.rejects(
      () => verifyIdToken(mk({ ...base, nonce: "n-wrong" }), "https://idp.example", "wamiro-client", "n-3", jwksUri),
      /nonce/,
    );
    await assert.rejects(
      () => verifyIdToken(mk(base), "https://other.example", "wamiro-client", "n-3", jwksUri),
      /issuer/,
    );
    await assert.rejects(
      () => verifyIdToken(mk({ ...base, aud: "other-client" }), "https://idp.example", "wamiro-client", "n-3", jwksUri),
      /audience/,
    );
    await assert.rejects(
      () => verifyIdToken(mk({ ...base, exp: Math.floor(Date.now() / 1000) - 10 }), "https://idp.example", "wamiro-client", "n-3", jwksUri),
      /expired/,
    );
    const tampered = mk(base).slice(0, -8) + "AAAAAAAA";
    await assert.rejects(
      () => verifyIdToken(tampered, "https://idp.example", "wamiro-client", "n-3", jwksUri),
      /signature/i,
    );
  });
});

test("toPem builds a working RSA PEM from a JWK", () => {
  const { publicKey } = makeRsaPair();
  const jwk = rsaJwk(publicKey);
  const pem = toPem({ kty: "RSA", n: jwk.n, e: jwk.e });
  assert.ok(pem.startsWith("-----BEGIN PUBLIC KEY-----"));
  const key = createPublicKey(pem);
  assert.equal(key.asymmetricKeyType, "rsa");
});