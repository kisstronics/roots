import assert from "node:assert/strict";
import test from "node:test";
import { isSafeSlug, slugify } from "../src/slug.mjs";
import { sign, verify } from "../src/session.mjs";

test("slugify matches family addresses", () => {
  assert.equal(slugify("Nair"), "nair");
  assert.equal(slugify("  Sharma & Sons "), "sharma-and-sons");
  assert.equal(isSafeSlug("sharma"), true);
  assert.equal(isSafeSlug("index"), false);
  assert.equal(isSafeSlug("../sharma"), false);
});

test("session cookie round trip", () => {
  process.env.SESSION_SECRET = "test-secret";
  const token = sign({ uid: "user-1", exp: Date.now() + 10_000 });
  assert.equal(verify(token).uid, "user-1");
});

test("session cookie rejects tampering and expiry", () => {
  process.env.SESSION_SECRET = "test-secret";
  const token = sign({ uid: "user-1", exp: Date.now() + 10_000 });
  const [body, sig] = token.split(".");
  assert.equal(verify(`${body}.${sig.slice(0, -1)}x`), null);
  assert.equal(verify(sign({ uid: "user-1", exp: Date.now() - 1 })), null);
});
