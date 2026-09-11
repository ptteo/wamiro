import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildGlitchtipEvent,
  glitchtipStoreUrl,
  isHealthProbePath,
  parseGlitchtipDsn,
} from "./glitchtip";

test("parseGlitchtipDsn reads key, host, and project id", () => {
  const p = parseGlitchtipDsn("https://pubk@errors.example.com/12");
  assert.deepEqual(p, { protocol: "https", host: "errors.example.com", key: "pubk", projectId: "12" });
  assert.equal(parseGlitchtipDsn(""), null);
  assert.equal(parseGlitchtipDsn("not-a-url"), null);
  assert.equal(parseGlitchtipDsn("https://errors.example.com/12"), null);
});

test("glitchtipStoreUrl points at /api/{project}/store/", () => {
  const p = parseGlitchtipDsn("http://key@localhost:8000/1");
  assert.ok(p);
  assert.equal(glitchtipStoreUrl(p), "http://localhost:8000/api/1/store/");
});

test("isHealthProbePath covers live/ready/root health only", () => {
  assert.equal(isHealthProbePath("/api/v1/health"), true);
  assert.equal(isHealthProbePath("/api/v1/health/live"), true);
  assert.equal(isHealthProbePath("/api/v1/health/ready"), true);
  assert.equal(isHealthProbePath("/api/v1/people"), false);
  assert.equal(isHealthProbePath("/status"), false);
});

test("buildGlitchtipEvent includes exception and request tags", () => {
  const ev = buildGlitchtipEvent(new Error("boom"), {
    path: "/api/v1/leave",
    requestId: "rid",
    orgId: "org",
    userId: "usr",
  });
  assert.equal(ev.level, "error");
  assert.equal((ev.tags as { path: string }).path, "/api/v1/leave");
  assert.equal((ev.user as { id: string }).id, "usr");
  const values = (ev.exception as { values: { value: string }[] }).values;
  assert.equal(values[0]?.value, "boom");
});
