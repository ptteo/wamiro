/**
 * G-17 — pure workday calendar helper.
 *
 * Mirrors the SQL used by `prorationFactor` (payroll/service.ts) so the
 * calendar logic is unit-testable without a database: a date is a workday
 * when its ISO weekday — evaluated in the ORGANIZATION's timezone, not the
 * server's — is listed in the org's workweek_days (ISO day numbers as text:
 * "1"=Mon … "7"=Sun; default ["1".."5"] = Mon–Fri, matching the old hardcoded
 * EXTRACT(ISODOW) < 6 behavior).
 */
export function isoDowIn(d: Date, timeZone: string): string {
  // en-CA gives YYYY-MM-DD; weekday derived locally, tz-safe without libs.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const short = get("weekday");
  // Weekday name → ISO number (Mon=1 … Sun=7). Short names are locale-stable
  // in en-CA; map explicitly to avoid first-day-of-week pitfalls.
  const map: Record<string, string> = {
    Mon: "1",
    Tue: "2",
    Wed: "3",
    Thu: "4",
    Fri: "5",
    Sat: "6",
    Sun: "7",
  };
  return map[short] ?? "1";
}

export function isWorkday(d: Date, workweekDays: string[], timeZone: string): boolean {
  if (!workweekDays || workweekDays.length === 0) return false;
  return workweekDays.includes(isoDowIn(d, timeZone));
}
