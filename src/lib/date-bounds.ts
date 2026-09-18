/**
 * G-30 — shared date-bounds validation for user-supplied dates/timestamps.
 *
 * Time logs and workplace bookings previously accepted any past/future date;
 * these helpers give every write path the same guardrails:
 *   - not before the epoch-ish floor (orgs don't log time in 1970),
 *   - not more than MAX_FUTURE_DAYS in the future (typos like 2206-01-01),
 *   - parsed dates must be real calendar days (2026-02-31 → invalid).
 */
import { ApiError } from "./errors";

/** Earliest accepted date: 2000-01-01. */
export const DATE_FLOOR_MS = Date.UTC(2000, 0, 1);
/** How far in the future a date may be (2 years covers planning horizons). */
export const MAX_FUTURE_DAYS = 730;

const MAX_FUTURE_MS = MAX_FUTURE_DAYS * 86_400_000;

/** Parse `yyyy-mm-dd` strictly — invalid calendar dates throw. */
export function parseIsoDate(input: string, field = "date"): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) throw ApiError.badRequest(`${field} must be formatted YYYY-MM-DD`);
  const [y, m, d] = input.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw ApiError.badRequest(`${field} is not a real calendar date`);
  }
  return dt;
}

/**
 * Validate a calendar day (YYYY-MM-DD string) against the floor/future window.
 * Returns the input unchanged when valid — call sites keep their string shape.
 */
export function assertDateInBounds(input: string, field = "date"): string {
  const dt = parseIsoDate(input, field);
  const t = dt.getTime();
  if (t < DATE_FLOOR_MS) throw ApiError.badRequest(`${field} is too far in the past`);
  if (t > Date.now() + MAX_FUTURE_MS) throw ApiError.badRequest(`${field} is too far in the future`);
  return input;
}

/**
 * Validate a timestamp range [start, end) for bookings: real dates, ordering,
 * and the same floor/future window as `assertDateInBounds`.
 */
export function assertTimestampRangeInBounds(start: Date, end: Date, field = "time"): void {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw ApiError.badRequest(`${field} must be valid timestamps`);
  }
  if (end <= start) throw ApiError.badRequest("Booking must end after it starts");
  if (start.getTime() < DATE_FLOOR_MS) throw ApiError.badRequest(`${field} is too far in the past`);
  if (end.getTime() > Date.now() + MAX_FUTURE_MS) throw ApiError.badRequest(`${field} is too far in the future`);
}
