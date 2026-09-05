import assert from "node:assert/strict";
import { test } from "node:test";

import { emailAllowedForDomains, parseDomainList } from "./email-domain";

test("empty allow-list accepts any email", () => {
  assert.equal(emailAllowedForDomains("a@x.com", []), true);
  assert.equal(emailAllowedForDomains("a@x.com", null), true);
});

test("exact host and subdomain match", () => {
  assert.equal(emailAllowedForDomains("sam@howdy.com", ["howdy.com"]), true);
  assert.equal(emailAllowedForDomains("sam@mail.howdy.com", ["howdy.com"]), true);
  assert.equal(emailAllowedForDomains("sam@evilhowdy.com", ["howdy.com"]), false);
  assert.equal(emailAllowedForDomains("sam@other.com", ["howdy.com"]), false);
});

test("parseDomainList strips @ and junk", () => {
  assert.deepEqual(parseDomainList(["@Howdy.COM", "bad", "howdy.com"]), ["howdy.com"]);
});
