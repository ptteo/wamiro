/** UTC date-only helpers. Leave dates are YYYY-MM-DD; never parse them as local. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function utcDate(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Normalize drizzle DATE / ISO strings to YYYY-MM-DD. */
export function asIsoDate(value: unknown): string {
  if (typeof value === "string") {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
    if (m) return m[1]!;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return utcDate(value);
  }
  throw new Error(`invalid leave date: ${String(value)}`);
}

export function parseUtcDate(iso: string): Date {
  return new Date(`${asIsoDate(iso)}T00:00:00.000Z`);
}

export function addUtcDays(iso: string, days: number): string {
  const d = parseUtcDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the ISO week that contains `iso` (YYYY-MM-DD). */
export function isoWeekMonday(iso: string): string {
  const d = parseUtcDate(iso);
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

export function isCurrentUtcWeek(mondayIso: string, today = utcDate()): boolean {
  return mondayIso <= today && today <= addUtcDays(mondayIso, 6);
}

export function fmtUtcDay(iso: string): string {
  const d = parseUtcDate(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function fmtUtcRange(start: string, end: string): string {
  if (start === end) return fmtUtcDay(start);
  const s = parseUtcDate(start);
  const e = parseUtcDate(end);
  if (s.getUTCFullYear() === e.getUTCFullYear() && s.getUTCMonth() === e.getUTCMonth()) {
    return `${fmtUtcDay(start)}–${e.getUTCDate()}`;
  }
  return `${fmtUtcDay(start)} – ${fmtUtcDay(end)}`;
}

export function fmtUtcWeekLabel(mondayIso: string): string {
  const sundayIso = addUtcDays(mondayIso, 6);
  if (mondayIso.slice(5, 7) === sundayIso.slice(5, 7)) {
    return `${fmtUtcDay(mondayIso)}–${Number(sundayIso.slice(8, 10))}`;
  }
  return `${fmtUtcDay(mondayIso)} – ${fmtUtcDay(sundayIso)}`;
}

export type TeamOutRow = {
  id: string;
  userId: string;
  userName: string;
  typeName: string;
  startDate: string;
  endDate: string;
  days: number;
  rangeLabel: string;
};

export type TeamWeek = {
  mondayIso: string;
  label: string;
  current: boolean;
  rows: TeamOutRow[];
};

/** Group approved trips into ISO weeks. Labels and "this week" are a server snapshot. */
export function buildTeamWeeks(
  rows: Omit<TeamOutRow, "rangeLabel">[],
  todayIso: string,
  limit = 8,
): TeamWeek[] {
  const map = new Map<string, TeamOutRow[]>();
  for (const r of rows) {
    const startDate = asIsoDate(r.startDate);
    const endDate = asIsoDate(r.endDate);
    const key = isoWeekMonday(startDate);
    const arr = map.get(key) ?? [];
    arr.push({ ...r, startDate, endDate, rangeLabel: fmtUtcRange(startDate, endDate) });
    map.set(key, arr);
  }
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(0, limit)
    .map(([mondayIso, weekRows]) => ({
      mondayIso,
      label: fmtUtcWeekLabel(mondayIso),
      current: isCurrentUtcWeek(mondayIso, todayIso),
      rows: weekRows,
    }));
}
