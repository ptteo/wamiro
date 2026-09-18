/** Email domain allow-list helpers + G-12 identity normalization. */

/**
 * G-12 — the single normalizer for email identities.
 *
 * `users.email` is globally unique while the product treats email as a
 * cross-org identity, so "Foo@X.com" and "foo@x.com" must never fork into two
 * user rows. Every create/lookup path normalizes through this function:
 * trim + lowercase (local part too — the storage is case-insensitive by
 * convention; RFC 5321 case-sensitivity is not honored by any real mailbox
 * provider and split-case rows are strictly harmful here).
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Compare an email's host against an org allow-list. Empty list = any domain. */
export function emailAllowedForDomains(email: string, domains: string[] | null | undefined): boolean {
  if (!domains || domains.length === 0) return true;
  const host = normalizeEmail(email).split("@")[1] ?? "";
  if (!host) return false;
  const allowed = domains.map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
  if (allowed.length === 0) return true;
  return allowed.some((d) => host === d || host.endsWith(`.${d}`));
}

export function parseDomainList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const d = item.trim().toLowerCase().replace(/^@/, "");
    if (d && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) && !out.includes(d)) out.push(d);
  }
  return out.slice(0, 20);
}
