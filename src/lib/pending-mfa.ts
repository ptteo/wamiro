/**
 * Short-lived token proving "password OK, awaiting second factor".
 * HMAC-signed with the user's passwordHash as key: no extra storage, and the
 * token dies automatically if the password changes. TTL 5 minutes.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const TTL_MS = 5 * 60_000;

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function createPendingMfaToken(userId: string, passwordHash: string): string {
  const payload = `${userId}.${Date.now() + TTL_MS}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload, passwordHash)}`;
}

export function verifyPendingMfaToken(
  token: string,
  userId: string,
  passwordHash: string,
): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  let payload: string;
  try {
    payload = Buffer.from(parts[0]!, "base64url").toString("utf8");
  } catch {
    return false;
  }
  const expected = sign(payload, passwordHash);
  const given = parts[1]!;
  if (
    expected.length !== given.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(given))
  ) {
    return false;
  }
  const [uid, expStr] = payload.split(".");
  return uid === userId && Number(expStr) > Date.now();
}
