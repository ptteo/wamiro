import assert from "node:assert/strict";
import { test } from "node:test";

import { clearTour, markTourFinished, shouldStartTour, tourKeyFromPath } from "./tour";

test("starts when unset or version is stale", () => {
  assert.equal(shouldStartTour({}, "home"), true);
  assert.equal(shouldStartTour({ home: { v: 1, doneAt: "2026-01-01" } }, "home", 1), false);
  assert.equal(shouldStartTour({ home: { v: 1, doneAt: "2026-01-01" } }, "home", 2), true);
});

test("mark + clear round-trip", () => {
  const done = markTourFinished({}, "leave", false, 1);
  assert.equal(shouldStartTour(done, "leave", 1), false);
  assert.ok(done.leave?.doneAt);
  assert.equal(shouldStartTour(clearTour(done, "leave"), "leave", 1), true);
});

test("path mapping", () => {
  assert.equal(tourKeyFromPath("/home"), "home");
  assert.equal(tourKeyFromPath("/tickets"), "tickets");
  assert.equal(tourKeyFromPath("/admin/users"), null);
});
