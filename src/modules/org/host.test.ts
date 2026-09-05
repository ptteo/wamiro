import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyHost, isPlatformHost, isValidCustomDomain } from "./host";

// APP_URL=http://localhost:3000 is the dev default (from .env), so the
// platform host is "localhost" unless PLATFORM_HOSTS is set.

test("classifies the platform host itself", () => {
  assert.equal(classifyHost("localhost:3000").mode, "platform");
  assert.equal(classifyHost("localhost").mode, "platform");
  assert.ok(isPlatformHost("localhost:3000"));
});

test("classifies a tenant subdomain of the platform host", () => {
  const r = classifyHost("acme.localhost:3000");
  assert.equal(r.mode, "subdomain");
  assert.equal(r.subdomain, "acme");
});

test("classifies a custom domain as custom", () => {
  const r = classifyHost("portal.acme.com");
  assert.equal(r.mode, "custom");
  assert.equal(r.subdomain, null);
});

test("rejects malformed subdomain prefixes as platform (not tenants)", () => {
  // api./www. style prefixes are ignored rather than being treated as slugs.
  const bad = classifyHost("api.localhost");
  assert.equal(bad.mode, "platform");
});

test("validates proposed custom domains", () => {
  assert.ok(isValidCustomDomain("portal.acme.com"));
  assert.ok(isValidCustomDomain("hr.eu.acme.co.uk"));
  assert.ok(!isValidCustomDomain("https://portal.acme.com"), "no scheme");
  assert.ok(!isValidCustomDomain("portal.acme.com/path"), "no path");
  assert.ok(!isValidCustomDomain("acme"), "needs a dot");
  assert.ok(!isValidCustomDomain("www.acme.com"), "no bare-www hosts");
  assert.ok(!isValidCustomDomain("foo.localhost"), "no platform subdomains");
});