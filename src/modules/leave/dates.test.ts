import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addUtcDays,
  asIsoDate,
  buildTeamWeeks,
  fmtUtcDay,
  fmtUtcRange,
  fmtUtcWeekLabel,
  isoWeekMonday,
  isCurrentUtcWeek,
  parseUtcDate,
  utcDate,
} from "./dates";

test("utcDate is YYYY-MM-DD in UTC, not the local calendar day", () => {
  // 2026-09-06 22:00 in IST is still 2026-09-06 UTC; 02:00 IST is 2026-09-05 UTC.
  assert.equal(utcDate(new Date("2026-09-06T18:30:00.000Z")), "2026-09-06");
  assert.equal(utcDate(new Date("2026-09-05T20:30:00.000Z")), "2026-09-05");
});

test("parseUtcDate treats YYYY-MM-DD as midnight UTC, not local", () => {
  const d = parseUtcDate("2026-09-06");
  assert.equal(d.toISOString(), "2026-09-06T00:00:00.000Z");
  assert.equal(d.getUTCDay(), 0);
});

test("isoWeekMonday is stable across timezones (Sunday and Monday edges)", () => {
  assert.equal(isoWeekMonday("2026-08-31"), "2026-08-31"); // Monday
  assert.equal(isoWeekMonday("2026-09-02"), "2026-08-31");
  assert.equal(isoWeekMonday("2026-09-06"), "2026-08-31"); // Sunday
  assert.equal(isoWeekMonday("2026-09-07"), "2026-09-07"); // next Monday
  assert.equal(isoWeekMonday("2026-01-01"), "2025-12-29"); // Thursday → prior Monday
});

test("isCurrentUtcWeek includes Sunday and excludes the next Monday", () => {
  assert.equal(isCurrentUtcWeek("2026-08-31", "2026-08-30"), false);
  assert.equal(isCurrentUtcWeek("2026-08-31", "2026-08-31"), true);
  assert.equal(isCurrentUtcWeek("2026-08-31", "2026-09-06"), true);
  assert.equal(isCurrentUtcWeek("2026-08-31", "2026-09-07"), false);
});

test("addUtcDays crosses months", () => {
  assert.equal(addUtcDays("2026-08-31", 6), "2026-09-06");
  assert.equal(addUtcDays("2026-09-07", 6), "2026-09-13");
});

test("fmtUtcDay and fmtUtcRange are locale-stable (en-US / UTC)", () => {
  assert.equal(fmtUtcDay("2026-09-06"), "Sep 6");
  assert.equal(fmtUtcRange("2026-09-06", "2026-09-06"), "Sep 6");
  assert.equal(fmtUtcRange("2026-09-06", "2026-09-10"), "Sep 6–10");
  assert.equal(fmtUtcRange("2026-08-31", "2026-09-06"), "Aug 31 – Sep 6");
});

test("fmtUtcWeekLabel matches the team calendar header", () => {
  assert.equal(fmtUtcWeekLabel("2026-08-31"), "Aug 31 – Sep 6");
  assert.equal(fmtUtcWeekLabel("2026-09-07"), "Sep 7–13");
});

test("asIsoDate keeps YYYY-MM-DD and strips a trailing time", () => {
  assert.equal(asIsoDate("2026-09-07"), "2026-09-07");
  assert.equal(asIsoDate("2026-09-07T00:00:00.000Z"), "2026-09-07");
  assert.equal(asIsoDate(new Date("2026-09-07T00:00:00.000Z")), "2026-09-07");
});

test("buildTeamWeeks snapshots labels and current-week from todayIso", () => {
  const karan = {
    id: "1",
    userId: "u",
    userName: "Karan Shah",
    typeName: "Annual Leave",
    startDate: "2026-09-07",
    endDate: "2026-09-07",
    days: 1,
  };
  const sun = {
    ...karan,
    id: "2",
    startDate: "2026-09-06",
    endDate: "2026-09-06",
  };

  const nextMon = buildTeamWeeks([karan], "2026-09-06");
  assert.equal(nextMon.length, 1);
  assert.equal(nextMon[0]!.mondayIso, "2026-09-07");
  assert.equal(nextMon[0]!.label, "Sep 7–13");
  assert.equal(nextMon[0]!.current, false);

  const thisWeek = buildTeamWeeks([sun], "2026-09-06");
  assert.equal(thisWeek[0]!.mondayIso, "2026-08-31");
  assert.equal(thisWeek[0]!.label, "Aug 31 – Sep 6");
  assert.equal(thisWeek[0]!.current, true);
  assert.equal(thisWeek[0]!.rows[0]!.rangeLabel, "Sep 6");

  const both = buildTeamWeeks([sun, karan], "2026-09-06");
  assert.deepEqual(
    both.map((w) => w.mondayIso),
    ["2026-08-31", "2026-09-07"],
  );
});
