/**
 * Web Push sender (Phase D) — zero-dependency RFC 8030 + RFC 8291.
 *
 * Every push message is:
 *  1. VAPID-authenticated (ES256 JWT over the P-256 application key) so the
 *     push service accepts the delivery.
 *  2. End-to-end encrypted with `aes128gcm` (RFC 8188) keyed by ECDH(P-256)
 *     between a fresh application-server key (carried in the record's keyid)
 *     and the subscription's p256dh key, mixed with the subscription's auth
 *     secret per RFC 8291 §3.
 *
 * Crypto is node:crypto only — no external push/vapid packages.
 */
import {
  createCipheriv,
  createHmac,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  diffieHellman,
  generateKeyPairSync,
  randomBytes,
} from "node:crypto";

import { env } from "./env";

export interface PushSubscriptionMaterial {
  endpoint: string;
  p256dh: string; // base64url, uncompressed P-256 point (65 bytes)
  auth: string; // base64url, 16 bytes
}

export interface PushMessage {
  title: string;
  body?: string | null;
  url?: string | null;
}

// ---------------------------------------------------------------------------
// VAPID
// ---------------------------------------------------------------------------

export function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64url");
}
export function b64urlDecode(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

/** audience = scheme + host of the push endpoint. */
export function endpointAudience(endpoint: string): string {
  try {
    const u = new URL(endpoint);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

/** Sign an ES256 JWT with a P-256 private key (PEM). Exported for tests. */
export function signVapidJwt(opts: {
  privateKeyPem: string;
  audience: string;
  subject: string;
  nowSec?: number;
}): string {
  const header = { typ: "JWT", alg: "ES256" };
  const claims = {
    aud: opts.audience,
    exp: (opts.nowSec ?? Math.floor(Date.now() / 1000)) + 12 * 3600,
    sub: opts.subject,
  };
  const h = b64urlEncode(Buffer.from(JSON.stringify(header)));
  const c = b64urlEncode(Buffer.from(JSON.stringify(claims)));
  const signer = createSign("sha256");
  signer.update(`${h}.${c}`);
  signer.end();
  const sig = signer.sign(createPrivateKey(opts.privateKeyPem));
  return `${h}.${c}.${b64urlEncode(derToRawEcdsa(sig, 32))}`;
}

/** DER (EC) → raw r||s for JWT signatures. Handles the outer SEQUENCE. */
function derToRawEcdsa(der: Buffer, size: number): Buffer {
  let i = 0;
  const tag = der[i] as number;
  i += 1;
  if (tag !== 0x30) return Buffer.alloc(size * 2);
  let seqLen = der[i] as number;
  i += 1;
  if ((seqLen & 0x80) !== 0) {
    const n = seqLen & 0x7f;
    seqLen = 0;
    for (let k = 0; k < n; k++) {
      seqLen = seqLen * 256 + (der[i] as number);
      i += 1;
    }
  }
  const end = i + seqLen;
  const readInt = (): Buffer => {
    i += 1; // INTEGER tag
    let l = der[i] as number;
    i += 1;
    if ((l & 0x80) !== 0) {
      const n = l & 0x7f;
      l = 0;
      for (let k = 0; k < n; k++) {
        l = l * 256 + (der[i] as number);
        i += 1;
      }
    }
    let b = der.subarray(i, i + l);
    i += l;
    if (b[0] === 0) b = b.subarray(1); // strip positive-pad zero
    return b;
  };
  const pad = (b: Buffer): Buffer =>
    b.length >= size ? b : Buffer.concat([Buffer.alloc(size - b.length), b]);
  const r = pad(readInt());
  const s = i < end ? pad(readInt()) : Buffer.alloc(size);
  return Buffer.concat([r, s]);
}

// ---------------------------------------------------------------------------
// aes128gcm content encryption (RFC 8188 + RFC 8291 §3)
// ---------------------------------------------------------------------------

/** RFC 5869 extract: PRK = HMAC-SHA256(salt, IKM). */
function hkdfExtract(salt: Buffer, ikm: Buffer): Buffer {
  return createHmac("sha256", salt).update(ikm).digest();
}

/** RFC 5869 expand for the single-block outputs Web Push needs (≤32 bytes). */
function hkdfExpand(prk: Buffer, info: Buffer, len: number): Buffer {
  // T(1) = HMAC(prk, info || 0x01) — one block covers the 16/12-byte needs.
  const t = createHmac("sha256", prk).update(Buffer.concat([info, Buffer.from([0x01])])).digest();
  return t.subarray(0, len);
}

/** Encrypt a payload for a push subscription. Returns the full HTTP body. */
export function encryptForSubscription(
  clientP256dh: string,
  clientAuth: string,
  payload: Buffer,
): Buffer {
  const clientPublic = b64urlDecode(clientP256dh);
  const authSecret = b64urlDecode(clientAuth);

  // Fresh application-server ECDH keypair per message.
  const server = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const serverPublic = Buffer.from(
    server.publicKey.export({ type: "spki", format: "der" }) as Buffer,
  );
  // Convert SPKI DER → uncompressed point (0x04||x||y) via re-export from JWK path:
  const serverRaw = ecPublicRawFromDer(serverPublic);
  const clientRaw = normalizeRawPoint(clientPublic);

  const ecdhSecret = diffieHellman({
    privateKey: server.privateKey,
    publicKey: ecPublicFromRaw(clientRaw),
  });

  // RFC 8291 §3.3 — combine ECDH secret with the auth secret.
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info", "utf8"),
    Buffer.from([0x00]),
    clientRaw,
    serverRaw,
  ]);
  const prkKey = hkdfExtract(authSecret, ecdhSecret);
  const ikm = hkdfExpand(prkKey, keyInfo, 32);

  const salt = randomBytes(16);
  // RFC 8291 §3.4 — second HKDF with the content-coding salt.
  const prk = hkdfExtract(salt, ikm);
  const cek = hkdfExpand(
    prk,
    Buffer.concat([Buffer.from("Content-Encoding: aes128gcm", "utf8"), Buffer.from([0x00])]),
    16,
  );
  const nonce = hkdfExpand(
    prk,
    Buffer.concat([Buffer.from("Content-Encoding: nonce", "utf8"), Buffer.from([0x00])]),
    12,
  );

  // Record header: keyid (app server public, length-prefixed) || salt || rs.
  const rs = 4096;
  const rsBuf = Buffer.alloc(4);
  rsBuf.writeUInt32BE(rs);
  const header = Buffer.concat([
    Buffer.from([serverRaw.length]),
    serverRaw,
    salt,
    rsBuf,
  ]);

  // Single record: plaintext || final-record padding delimiter (RFC 8188).
  const record = Buffer.concat([payload, Buffer.from([0x02])]);
  const cipher = encryptAes128gcm(cek, nonce, header, record);
  return Buffer.concat([header, cipher]);
}

function encryptAes128gcm(key: Buffer, iv: Buffer, aad: Buffer, plaintext: Buffer): Buffer {
  const cipher = createCipheriv("aes-128-gcm", key, iv, { authTagLength: 16 });
  cipher.setAAD(aad);
  const head = cipher.update(plaintext);
  const tail = cipher.final();
  return Buffer.concat([head, tail, cipher.getAuthTag()]);
}

/** Public-key helpers (P-256). */
function ecPublicRawFromDer(spkiDer: Buffer): Buffer {
  // SPKI DER → raw point: last 65 bytes are 0x04||x||y for EC keys.
  const jwk = createPublicKey({ key: spkiDer, format: "der", type: "spki" }).export({
    format: "jwk",
  }) as { x?: string; y?: string };
  return Buffer.concat([
    Buffer.from([0x04]),
    b64urlDecode(jwk.x ?? ""),
    b64urlDecode(jwk.y ?? ""),
  ]);
}
function normalizeRawPoint(raw: Buffer): Buffer {
  // Some push services deliver 65-byte points; tolerate 64-byte (missing 0x04).
  if (raw.length === 64) return Buffer.concat([Buffer.from([0x04]), raw]);
  return raw;
}
function ecPublicFromRaw(raw: Buffer) {
  const x = raw.subarray(1, 33);
  const y = raw.subarray(33, 65);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: x.toString("base64url"),
    y: y.toString("base64url"),
  };
  return createPublicKey({ key: jwk, format: "jwk" });
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

export interface PushConfig {
  publicKey?: string; // base64url
  privateKeyPem?: string;
  subject: string;
}

export function pushConfig(): PushConfig {
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKeyPem: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT,
  };
}

export function isPushConfigured(): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

export type SendResult =
  | { ok: true; status: number }
  | { ok: false; reason: "config" | "gone" | "http" | "error"; status?: number; message?: string };

/**
 * Deliver one encrypted push message. `gone` (404/410) means the endpoint is
 * dead and should be removed from the DB.
 */
export async function sendWebPush(
  sub: PushSubscriptionMaterial,
  message: PushMessage,
): Promise<SendResult> {
  const cfg = pushConfig();
  if (!cfg.publicKey || !cfg.privateKeyPem) return { ok: false, reason: "config" };
  const audience = endpointAudience(sub.endpoint);
  if (!audience) return { ok: false, reason: "error", message: "invalid endpoint" };

  try {
    const body = encryptForSubscription(sub.p256dh, sub.auth, Buffer.from(JSON.stringify(message), "utf8"));
    const token = signVapidJwt({
      privateKeyPem: cfg.privateKeyPem,
      audience,
      subject: cfg.subject,
    });
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        authorization: `vapid t=${token}, k=${cfg.publicKey}`,
        "content-encoding": "aes128gcm",
        "content-type": "application/octet-stream",
        ttl: "2419200",
      },
      body: body as unknown as BodyInit,
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404 || res.status === 410) return { ok: false, reason: "gone", status: res.status };
    if (!res.ok) return { ok: false, reason: "http", status: res.status, message: res.statusText };
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, reason: "error", message: String(e) };
  }
}

/** Verify a VAPID JWT (tests + future debugging). Exported for unit tests. */
export function verifyVapidJwt(opts: {
  jwt: string;
  publicKeyPem: string;
  expectedAudience: string;
}): boolean {
  const parts = opts.jwt.split(".");
  if (parts.length !== 3) return false;
  try {
    const claims = JSON.parse(b64urlDecode(parts[1]!).toString("utf8")) as { aud?: string; exp?: number };
    if (claims.aud !== opts.expectedAudience) return false;
    if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) return false;
    const verifier = createVerify("sha256");
    verifier.update(`${parts[0]}.${parts[1]}`);
    verifier.end();
    return verifier.verify(createPublicKey(opts.publicKeyPem), rawToDerEcdsa(b64urlDecode(parts[2]!), 32));
  } catch {
    return false;
  }
}

function rawToDerEcdsa(raw: Buffer, size: number): Buffer {
  const r = raw.subarray(0, size);
  const s = raw.subarray(size);
  const int = (b: Buffer): Buffer => {
    let v = b;
    while (v.length > 1 && v[0] === 0) v = v.subarray(1);
    const body = v[0]! & 0x80 ? Buffer.concat([Buffer.from([0x00]), v]) : v;
    return Buffer.concat([Buffer.from([0x02]), Buffer.from([body.length]), body]);
  };
  const seqBody = Buffer.concat([int(r), int(s)]);
  const len = Buffer.from([seqBody.length]);
  return Buffer.concat([Buffer.from([0x30]), len, seqBody]);
}