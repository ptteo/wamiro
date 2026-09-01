/**
 * R3 — Authorization precedence contract (master command §14).
 * One deterministic order, tested:
 *   explicit deny > user allow-override > role grant > default(deny)
 * Scope model: SELF < TEAM < DEPARTMENT < COMPANY < GLOBAL; widest wins.
 * Non-implication: X.manage never implies other actions (e.g. leave.approve).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { Override } from "./engine";
import { can, computeEffectiveAccess, widestScope } from "./engine";

const d = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);
type G = { permission: string; scope: "SELF" | "TEAM" | "DEPARTMENT" | "COMPANY" | "GLOBAL" };
const O = (permission: string, effect: "allow" | "deny", scope: G["scope"], expiresAt: Date | null = null): Override => ({
  permission,
  effect,
  scope,
  expiresAt,
});

test("P1 default is deny — no grants, no overrides", () => {
  const a = computeEffectiveAccess([], []);
  assert.equal(can(a, "employees.view"), false);
});

test("P2 explicit deny beats role grant (deny > role)", () => {
  const a = computeEffectiveAccess(
    [{ permission: "documents.view", scope: "COMPANY" }],
    [O("documents.view", "deny", "COMPANY")],
  );
  assert.equal(can(a, "documents.view"), false);
});

test("P3 user allow-override beats role deny? NO — deny still wins (documented)", () => {
  // §14 puts explicit deny at the very top, above user permissions.
  const a = computeEffectiveAccess(
    [{ permission: "finance.export", scope: "COMPANY" }],
    [
      O("finance.export", "allow", "COMPANY"),
      O("finance.export", "deny", "COMPANY"),
    ],
  );
  assert.equal(can(a, "finance.export"), false);
});

test("P4 user allow-override fills gaps left by roles", () => {
  const a = computeEffectiveAccess([], [O("audit.view", "allow", "COMPANY")]);
  assert.equal(can(a, "audit.view"), true);
});

test("P5 role grant satisfies requirement without overrides", () => {
  const a = computeEffectiveAccess([{ permission: "recruitment.manage", scope: "DEPARTMENT" }], []);
  assert.equal(can(a, "recruitment.manage"), true);
});

test("S1 widest scope wins across multiple grants", () => {
  const a = computeEffectiveAccess(
    [
      { permission: "attendance.view_team", scope: "TEAM" },
      { permission: "attendance.view_team", scope: "COMPANY" },
    ],
    [],
  );
  assert.equal(widestScope(a, "attendance.view_team"), "COMPANY");
});

test("S2 override can widen scope beyond roles", () => {
  const a = computeEffectiveAccess(
    [{ permission: "leave.view_team", scope: "TEAM" }],
    [O("leave.view_team", "allow", "GLOBAL")],
  );
  assert.equal(widestScope(a, "leave.view_team"), "GLOBAL");
});

test("E1 expired deny stops denying — role grant resurfaces", () => {
  const a = computeEffectiveAccess(
    [{ permission: "tasks.view_self", scope: "SELF" }],
    [O("tasks.view_self", "deny", "SELF", d(-1))],
  );
  assert.equal(can(a, "tasks.view_self"), true);
});

test("E2 future expiry means 'active until' — grants are live immediately (no start field)", () => {
  const a = computeEffectiveAccess([], [O("goals.manage", "allow", "COMPANY", d(7))]);
  assert.equal(can(a, "goals.manage"), true);
});

test("N1 unknown permission key never grants — even via override", () => {
  const a = computeEffectiveAccess([], [O("not.a.permission", "allow", "GLOBAL")]);
  assert.equal(can(a, "not.a.permission"), false);
});

test("N2 manage does NOT imply sibling actions (documented non-implication)", () => {
  const a = computeEffectiveAccess(
    [
      { permission: "leave.manage", scope: "COMPANY" },
      { permission: "requests.manage", scope: "COMPANY" },
    ],
    [],
  );
  assert.equal(can(a, "leave.approve"), false, "manage must not silently grant approve");
  assert.equal(can(a, "requests.approve"), false);
});
