import assert from "node:assert/strict";
import { test } from "node:test";

import { activityLabel } from "./service";

test("activityLabel maps known actions and falls back", () => {
  assert.equal(activityLabel("USER_LOGIN"), "Signed in");
  assert.equal(activityLabel("TICKET_CREATED"), "Opened a ticket");
  assert.equal(activityLabel("SOMETHING_OBSCURE"), "Account activity");
});
