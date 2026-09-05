/**
 * Envelope encryption for at-rest secrets (Phase 0.4).
 *
 * Format: `v1:<base64(iv|tag|ciphertext)>`
 *  - AES-256-GCM
 *  - Random 12-byte IV per encryption
 *  - 32-byte key derived from `SECRET_KEY` env var via SHA-256
 *
 * We require the user to set `SECRET_KEY` in production. In dev (no
 * SECRET_KEY) we fall back to a process-scoped key so the app still
 * runs; this is documented in `.env.example`.
 *
 * No external dependency — only Node's built-in `crypto`.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;

function getKey(): Buffer {
  const raw = process.env.SECRET_KEY;
  if (raw && raw.length >= 16) {
    return createHash("sha256").update(raw, "utf8").digest();
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SECRET_KEY is required in production (>=16 chars). See .env.example.",
    );
  }
  // Dev fallback: derive a stable key from machine id so restarts can
  // still decrypt. NOT for production.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const os = require("node:os") as typeof import("node:os");
  return createHash("sha256")
    .update(`${os.hostname()}|${os.userInfo().username}|wamiro-dev-fallback`, "utf8")
    .digest();
}

export function encryptSecret(plaintext: string): string {
  if (plaintext === "") return "";
  const iv = randomBytes(IV_BYTES);
  const key = getKey();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${Buffer.concat([iv, tag, ct]).toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  if (payload === "") return "";
  if (!payload.startsWith(`${VERSION}:`)) {
    // Legacy plaintext: return as-is so existing rows don't break
    // during the in-place migration window.
    return payload;
  }
  const buf = Buffer.from(payload.slice(VERSION.length + 1), "base64");
  if (buf.length < IV_BYTES + 16) {
    throw new Error("encrypted secret: payload too short");
  }
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + 16);
  const ct = buf.subarray(IV_BYTES + 16);
  const key = getKey();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** Test helper: re-encrypts a legacy plaintext row to the v1 format. */
export function reencrypt(plaintext: string): string {
  if (plaintext === "" || plaintext.startsWith(`${VERSION}:`)) return plaintext;
  return encryptSecret(plaintext);
}
