import assert from "node:assert/strict";
import test from "node:test";
import { configuredOrLive, publicBase } from "../src/http.mjs";

function req(host, protocol = "https") {
  return { protocol, get: (header) => (header === "host" ? host : "") };
}

test("a public host replaces a localhost app url", () => {
  const previous = process.env.APP_PUBLIC_URL;
  process.env.APP_PUBLIC_URL = "http://localhost:5173/roots";
  try {
    assert.equal(publicBase(req("roots-8rak.vercel.app")), "https://roots-8rak.vercel.app/roots");
    assert.equal(publicBase(req("localhost:5173", "http")), "http://localhost:5173/roots");
  } finally {
    if (previous === undefined) delete process.env.APP_PUBLIC_URL;
    else process.env.APP_PUBLIC_URL = previous;
  }
});

test("google callback follows the public host", () => {
  const previous = process.env.GOOGLE_CALLBACK_URL;
  process.env.GOOGLE_CALLBACK_URL = "http://localhost:5173/roots/api/auth/google/callback";
  try {
    assert.equal(
      configuredOrLive(req("roots-8rak.vercel.app"), process.env.GOOGLE_CALLBACK_URL, "/api/auth/google/callback"),
      "https://roots-8rak.vercel.app/roots/api/auth/google/callback",
    );
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_CALLBACK_URL;
    else process.env.GOOGLE_CALLBACK_URL = previous;
  }
});
