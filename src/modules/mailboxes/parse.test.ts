import assert from "node:assert/strict";
import { test } from "node:test";

import { textFromParsed } from "./service";

test("prefers plaintext over HTML", () => {
  assert.equal(textFromParsed({ text: "  hello  ", html: "<p>ignored</p>" }), "hello");
});

test("HTML-only mail is stripped instead of dropped", () => {
  assert.equal(textFromParsed({ text: "", html: "<p>Hi <b>Sam</b></p>" }), "Hi Sam");
});

test("empty parts yield empty string", () => {
  assert.equal(textFromParsed({ text: false, html: false }), "");
});
