import assert from "node:assert/strict";
import { test } from "node:test";

import {
  approverMayForceCancel,
  employeeMayRequestCancel,
  employeeMayWithdraw,
} from "./cancel";

test("employee may withdraw only pending leave", () => {
  assert.equal(employeeMayWithdraw("pending"), true);
  assert.equal(employeeMayWithdraw("approved"), false);
  assert.equal(employeeMayWithdraw("rejected"), false);
  assert.equal(employeeMayWithdraw("cancelled"), false);
  assert.equal(employeeMayWithdraw("cancel_requested"), false);
});

test("employee may request cancel on approved leave through the last day", () => {
  assert.equal(employeeMayRequestCancel("approved", "2026-09-10", "2026-09-10"), true);
  assert.equal(employeeMayRequestCancel("approved", "2026-09-11", "2026-09-10"), true);
  assert.equal(employeeMayRequestCancel("approved", "2026-09-09", "2026-09-10"), false);
  assert.equal(employeeMayRequestCancel("pending", "2026-09-11", "2026-09-10"), false);
  assert.equal(employeeMayRequestCancel("rejected", "2026-09-11", "2026-09-10"), false);
  assert.equal(employeeMayRequestCancel("cancelled", "2026-09-11", "2026-09-10"), false);
  assert.equal(employeeMayRequestCancel("cancel_requested", "2026-09-11", "2026-09-10"), false);
});

test("approver may force-cancel approved or cancel-requested leave", () => {
  assert.equal(approverMayForceCancel("approved"), true);
  assert.equal(approverMayForceCancel("cancel_requested"), true);
  assert.equal(approverMayForceCancel("pending"), false);
  assert.equal(approverMayForceCancel("rejected"), false);
  assert.equal(approverMayForceCancel("cancelled"), false);
});
