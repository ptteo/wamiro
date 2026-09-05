import assert from "node:assert/strict";
import { test } from "node:test";

import { passwordIssues, passwordStrongEnough } from "./password-policy";

test("rejects short or letter-only / digit-only secrets", () => {
  assert.ok(passwordIssues("short1").length > 0);
  assert.ok(passwordIssues("lettersonly").length > 0);
  assert.ok(passwordIssues("1234567890").length > 0);
});

test("accepts a 10+ character mixed password", () => {
  assert.equal(passwordStrongEnough("Correct99!"), true);
  assert.equal(passwordIssues("Correct99!").length, 0);
});
