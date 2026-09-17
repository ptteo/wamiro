import assert from "node:assert/strict";
import { test } from "node:test";

import { emailAllowedForDomains, normalizeEmail, parseDomainList } from "./email-domain.js";

test("normalizeEmail trims and lowercases the whole address", () => {
  assert.equal(normalizeEmail("  Foo.Bar@Example.COM  "), "foo.bar@example.com");
  assert.equal(normalizeEmail("USER@x.com"), "user@x.com");
  assert.equal(normalizeEmail("already@normal.email"), "already@normal.email");
});

test("normalizeEmail forks no identity: mixed-case inputs collide", () => {
  // The whole point of G-12: these must be the SAME identity string.
  assert.equal(normalizeEmail("Alice@Corp.com"), normalizeEmail("alice@corp.com"));
  assert.equal(normalizeEmail("ALICE@CORP.COM"), normalizeEmail("alice@corp.com"));
});

test("emailAllowedForDomains honors subdomains and @-prefixed entries", () => {
  assert.equal(emailAllowedForDomains("a@corp.com", ["corp.com"]), true);
  assert.equal(emailAllowedForDomains("a@team.corp.com", ["corp.com"]), true);
  assert.equal(emailAllowedForDomains("a@evil.com", ["corp.com"]), false);
  assert.equal(emailAllowedForDomains("a@corp.com", ["@corp.com"]), true);
  assert.equal(emailAllowedForDomains("a@corp.com", []), true); // empty = any
});

test("parseDomainList drops junk, dedupes, lowercases", () => {
  assert.deepEqual(parseDomainList(["Corp.com", "@x.io", "not a domain", 42, "corp.com"]), [
    "corp.com",
    "x.io",
  ]);
});
