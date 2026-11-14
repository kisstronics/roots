import assert from "node:assert/strict";
import test from "node:test";
import { expiryDate } from "../src/access.mjs";

test("share links expire in 30 days, 60 days, or never", () => {
  const now = Date.parse("2026-01-01T00:00:00.000Z");
  assert.equal(expiryDate("30", now).toISOString(), "2026-01-31T00:00:00.000Z");
  assert.equal(expiryDate("60", now).toISOString(), "2026-03-02T00:00:00.000Z");
  assert.equal(expiryDate("never", now), null);
  assert.throws(() => expiryDate("7", now), /30 days/);
});
