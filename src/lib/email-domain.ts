/** Compare an email's host against an org allow-list. Empty list = any domain. */
export function emailAllowedForDomains(email: string, domains: string[] | null | undefined): boolean {
  if (!domains || domains.length === 0) return true;
  const host = email.trim().toLowerCase().split("@")[1] ?? "";
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
