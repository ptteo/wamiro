import assert from "node:assert/strict";
import { test } from "node:test";

import type { Override } from "./engine";
import { can, computeEffectiveAccess, widestScope } from "./engine";

const d = (daysFromNow: number) =>
  new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);

test("role grants give access", () => {
  const a = computeEffectiveAccess([{ permission: "leave.apply", scope: "SELF" }], []);
  assert.equal(can(a, "leave.apply"), true);
  assert.equal(can(a, "users.manage"), false);
});

test("deny beats role grant", () => {
  const a = computeEffectiveAccess(
    [{ permission: "employees.view", scope: "COMPANY" }],
    [{ permission: "employees.view", effect: "deny", scope: "COMPANY", expiresAt: null }],
  );
  assert.equal(can(a, "employees.view"), false);
});

test("allow override beats absence of role grant", () => {
  const a = computeEffectiveAccess(
    [],
    [{ permission: "audit.view", effect: "allow", scope: "COMPANY", expiresAt: null }],
  );
  assert.equal(can(a, "audit.view"), true);
});

test("expired override is ignored — both allow and deny", () => {
  const overrides: Override[] = [
    { permission: "audit.view", effect: "allow", scope: "COMPANY", expiresAt: d(-1) },
    { permission: "employees.view", effect: "deny", scope: "COMPANY", expiresAt: d(-1) },
  ];
  const a = computeEffectiveAccess(
    [{ permission: "employees.view", scope: "COMPANY" }],
    overrides,
  );
  assert.equal(can(a, "audit.view"), false); // never granted by a role
  assert.equal(can(a, "employees.view"), true); // deny expired → role grant stands
});

test("widest scope wins across roles and overrides", () => {
  const a = computeEffectiveAccess(
    [
      { permission: "attendance.view_self", scope: "SELF" },
      { permission: "attendance.view_team", scope: "TEAM" },
    ],
    [{ permission: "attendance.view_company", effect: "allow", scope: "COMPANY", expiresAt: null }],
  );
  assert.equal(widestScope(a, "attendance."), "COMPANY");
});

test("unknown permission key never grants, even via override", () => {
  const a = computeEffectiveAccess(
    [],
    [{ permission: "not.a.permission", effect: "allow", scope: "GLOBAL", expiresAt: null }],
  );
  assert.equal(can(a, "not.a.permission"), false);
});

test("deny later in list still beats earlier allow override", () => {
  const a = computeEffectiveAccess(
    [],
    [
      { permission: "roles.manage", effect: "allow", scope: "COMPANY", expiresAt: null },
      { permission: "roles.manage", effect: "deny", scope: "COMPANY", expiresAt: null },
    ],
  );
  assert.equal(can(a, "roles.manage"), false);
});
