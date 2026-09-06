export interface QuietHours {
  start: string;
  end: string;
  tz?: string;
}

export interface EmailPrefs {
  kinds?: Record<string, boolean>;
  digest?: "off" | "weekly";
  quietHours?: QuietHours | null;
  lastDigestAt?: string;
}

function parseHm(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function minutesInTz(now: Date, tz?: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz || undefined,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const min = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return h * 60 + min;
  } catch {
    return now.getHours() * 60 + now.getMinutes();
  }
}

/** True when `now` falls in the quiet window (supports overnight ranges). */
export function inQuietHours(now: Date, hours: QuietHours | null | undefined): boolean {
  if (!hours?.start || !hours.end) return false;
  const start = parseHm(hours.start);
  const end = parseHm(hours.end);
  if (start === null || end === null || start === end) return false;
  const cur = minutesInTz(now, hours.tz);
  if (start < end) return cur >= start && cur < end;
  return cur >= start || cur < end;
}

export function emailKindAllowed(prefs: EmailPrefs | null | undefined, kind: string): boolean {
  if (!prefs?.kinds) return true;
  if (prefs.kinds[kind] === false) return false;
  const family = kind.includes(".") ? kind.split(".")[0]! : kind;
  if (family !== kind && prefs.kinds[family] === false) return false;
  return true;
}

export function parseEmailPrefs(raw: unknown): EmailPrefs {
  if (!raw || typeof raw !== "object") return { digest: "off" };
  const o = raw as Record<string, unknown>;
  const kinds =
    o.kinds && typeof o.kinds === "object" && !Array.isArray(o.kinds)
      ? Object.fromEntries(Object.entries(o.kinds as Record<string, unknown>).map(([k, v]) => [k, v === true]))
      : undefined;
  const digest = o.digest === "weekly" ? "weekly" : "off";
  let quietHours: QuietHours | null = null;
  if (o.quietHours && typeof o.quietHours === "object") {
    const q = o.quietHours as Record<string, unknown>;
    if (typeof q.start === "string" && typeof q.end === "string") {
      quietHours = { start: q.start, end: q.end, tz: typeof q.tz === "string" ? q.tz : undefined };
    }
  }
  return {
    kinds,
    digest,
    quietHours,
    lastDigestAt: typeof o.lastDigestAt === "string" ? o.lastDigestAt : undefined,
  };
}

export function groupDigest(rows: { type: string; title: string }[]): { type: string; count: number; sample: string }[] {
  const map = new Map<string, { count: number; sample: string }>();
  for (const r of rows) {
    const cur = map.get(r.type) ?? { count: 0, sample: r.title };
    cur.count += 1;
    map.set(r.type, cur);
  }
  return [...map.entries()].map(([type, v]) => ({ type, ...v }));
}
