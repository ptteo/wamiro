/**
 * Paddle webhook signature verification (no SDK).
 *
 * Header: `Paddle-Signature: ts=<unix>;h1=<hex>` (multiple h1 allowed while
 * rotating secrets). Signed payload is `${ts}:${rawBody}` HMAC-SHA256 hex.
 * Timestamp skew is 5 minutes — Paddle's sample uses 5 seconds, which is too
 * tight for a jobs/webhook hop.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const PADDLE_SIGNATURE_MAX_SKEW_MS = 5 * 60_000;

export function parsePaddleSignature(header: string): { ts: string; h1: string[] } | null {
  if (!header.trim()) return null;
  let ts: string | undefined;
  const h1: string[] = [];
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k === "ts") ts = v;
    else if (k === "h1" && v) h1.push(v.toLowerCase());
  }
  if (!ts || h1.length === 0) return null;
  return { ts, h1 };
}

export function paddleSignatureHex(secret: string, ts: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${ts}:${rawBody}`, "utf8").digest("hex");
}

export function verifyPaddleSignature(
  header: string,
  rawBody: string,
  secret: string,
  nowMs = Date.now(),
  maxSkewMs = PADDLE_SIGNATURE_MAX_SKEW_MS,
): boolean {
  if (!secret) return false;
  const parsed = parsePaddleSignature(header);
  if (!parsed) return false;
  const tsNum = Number(parsed.ts);
  if (!Number.isFinite(tsNum)) return false;
  if (Math.abs(nowMs - tsNum * 1000) > maxSkewMs) return false;
  const expected = paddleSignatureHex(secret, parsed.ts, rawBody);
  const expectedBuf = Buffer.from(expected, "utf8");
  for (const given of parsed.h1) {
    const givenBuf = Buffer.from(given, "utf8");
    if (givenBuf.length === expectedBuf.length && timingSafeEqual(givenBuf, expectedBuf)) {
      return true;
    }
  }
  return false;
}
