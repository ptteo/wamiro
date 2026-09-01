/**
 * RFC 6238 TOTP (SHA-1, 6 digits, 30s step) + base32 secrets.
 * Pure node:crypto — no dependency. Compatible with Google Authenticator,
 * Authy, 1Password, etc. via otpauth:// provisioning URIs.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateSecret(): string {
  // 20 bytes = 160 bits, the RFC's recommended secret size
  const buf = randomBytes(20);
  let bits = "";
  for (const byte of buf) bits += byte.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

function base32Decode(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/\s+/g, "");
  let bits = "";
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base32 character");
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter % 2 ** 32, 4);
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

/** Verify a 6-digit code for the current step ± window (default 1 = ±30s). */
export function verifyTotp(secret: string, code: string, window = 1): boolean {
  const clean = code.replace(/\D/g, "");
  if (clean.length !== 6) return false;
  const step = Math.floor(Date.now() / 30_000);
  for (let i = -window; i <= window; i++) {
    const expected = hotp(secret, step + i);
    if (
      expected.length === clean.length &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(clean))
    ) {
      return true;
    }
  }
  return false;
}

export function provisioningUri(email: string, secret: string, issuer = "Wamiro"): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
