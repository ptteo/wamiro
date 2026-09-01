/**
 * Redaction helpers for the AI assistant. The model output and any tool
 * results that get echoed back to the user pass through this before they
 * leave the server. Defense-in-depth — the model never gets data it
 * shouldn't, and even if it does, the answer we return has been scrubbed.
 *
 * Conservative by design: false positives (an email being hidden) are
 * acceptable; false negatives (a leak getting through) are not.
 */
import { createHash } from "node:crypto";

// Match the kind of data the rest of the system already stores, so a
// user can't tell from the redacted form whether the server has the
// data — it just doesn't echo it.
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?<!\d)(\+?\d[\d\s().-]{8,}\d)(?!\d)/g;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const MONEY_RE = /(?<!\d)([A-Z]{3}\s?)?(\$|€|£|¥|₹)\s?\d{1,3}(,\d{3})*(\.\d{2})?/g;
// SSN-shape: 3-2-4 digits, but only when separated by spaces or dashes.
// Bound to the US format because we don't have signals for other regions.
const SSN_RE = /(?<!\d)\d{3}[- ]\d{2}[- ]\d{4}(?!\d)/g;
// Credit-card-ish: 13-19 digits with optional spaces or dashes.
const CC_RE = /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g;
// IPv4 — sometimes leaked through tool output. Replace with <ip>.
const IPV4_RE = /(?<!\d)(?:\d{1,3}\.){3}\d{1,3}(?!\d)/g;

export interface RedactCounts {
  email: number;
  phone: number;
  uuid: number;
  ssn: number;
  cc: number;
  money: number;
  ipv4: number;
}

export interface RedactResult {
  text: string;
  counts: RedactCounts;
  redactionCount: number;
}

const ZERO_COUNTS: RedactCounts = { email: 0, phone: 0, uuid: 0, ssn: 0, cc: 0, money: 0, ipv4: 0 };

/** Stable placeholder id so two redactions of the same address get the same token. */
function stableToken(label: string, value: string): string {
  const h = createHash("sha256").update(value).digest("hex").slice(0, 8);
  return `<${label}_${h}>`;
}

/**
 * Redact obvious PII / sensitive patterns from `text`.
 *
 * @param allowUuids - if true, UUIDs in the text are left alone (useful
 *                     when redacting model output that legitimately
 *                     references a citation or an entity id we know
 *                     the user can see).
 * @param allowEmails - if true, email addresses are left alone (useful
 *                      when the user asked for their own email, e.g.
 *                      "who am I?").
 */
export function redactPII(
  text: string,
  opts: { allowUuids?: boolean; allowEmails?: boolean } = {},
): RedactResult {
  if (!text) return { text, counts: { ...ZERO_COUNTS }, redactionCount: 0 };
  const counts: RedactCounts = { ...ZERO_COUNTS };

  let out = text;

  if (!opts.allowEmails) {
    out = out.replace(EMAIL_RE, (m) => {
      counts.email++;
      return stableToken("email", m.toLowerCase());
    });
  }
  out = out.replace(PHONE_RE, (m) => {
    counts.phone++;
    return stableToken("phone", m.replace(/\s+/g, ""));
  });
  if (!opts.allowUuids) {
    out = out.replace(UUID_RE, (m) => {
      counts.uuid++;
      return stableToken("id", m.toLowerCase());
    });
  }
  out = out.replace(SSN_RE, (m) => {
    counts.ssn++;
    return stableToken("ssn", m);
  });
  out = out.replace(CC_RE, (m) => {
    counts.cc++;
    return stableToken("card", m.replace(/\s|-/g, ""));
  });
  out = out.replace(MONEY_RE, (m) => {
    counts.money++;
    return `<money>`;
  });
  out = out.replace(IPV4_RE, (m) => {
    counts.ipv4++;
    return `<ip>`;
  });

  const redactionCount = Object.values(counts).reduce((a, b) => a + b, 0);
  return { text: out, counts, redactionCount };
}

/** Return only the keys in `obj` that are in `allow`. Drops the rest. */
export function pickFields<T extends Record<string, unknown>>(
  obj: T,
  allow: readonly string[],
): Partial<T> {
  const out: Partial<T> = {};
  const set = new Set(allow);
  for (const [k, v] of Object.entries(obj)) {
    if (set.has(k)) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/**
 * Truncate a string to `max` characters. If truncation happens, append
 * a `[truncated]` marker so the model can see the answer was cut.
 */
export function capText(s: string, max: number): string {
  if (!s || s.length <= max) return s;
  return s.slice(0, max) + "… [truncated]";
}
