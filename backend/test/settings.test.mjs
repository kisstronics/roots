import assert from "node:assert/strict";
import test from "node:test";
import { APP_SETTING_KEYS, loadAppSettings } from "../src/settings.mjs";

test("backend settings are read from app_settings and the database url stays put", async () => {
  const tracked = [...APP_SETTING_KEYS, "DATABASE_URL", "PORT"];
  const saved = Object.fromEntries(tracked.map((key) => [key, process.env[key]]));
  for (const key of APP_SETTING_KEYS) delete process.env[key];
  process.env.DATABASE_URL = "postgres://keep-me";
  process.env.SMTP_HOST = "from-env.example";
  process.env.ADMIN_EMAIL = "from-env@example.com";

  const stored = new Map([
    ["SMTP_HOST", "from-db.example"],
    ["DATABASE_URL", "postgres://ignore-me"],
    ["max_families_per_user", "10"],
  ]);
  const client = {
    async query(sql, params = []) {
      if (sql.includes("INSERT")) {
        const [keys, values] = params;
        keys.forEach((key, index) => {
          if (!stored.has(key)) stored.set(key, values[index]);
        });
        return { rows: [] };
      }
      const keys = params[0] ?? [];
      return {
        rows: keys.filter((key) => stored.has(key)).map((key) => ({ key, value: stored.get(key) })),
      };
    },
  };

  try {
    await loadAppSettings(client);
    assert.equal(process.env.DATABASE_URL, "postgres://keep-me");
    assert.equal(process.env.SMTP_HOST, "from-db.example");
    assert.equal(process.env.ADMIN_EMAIL, "from-env@example.com");
    assert.equal(stored.get("ADMIN_EMAIL"), "from-env@example.com");
    assert.equal(stored.get("DATABASE_URL"), "postgres://ignore-me");
    assert.equal(stored.has("SESSION_SECRET"), false);
    assert.equal(process.env.SESSION_SECRET, "dev-only-change-me");
    assert.equal(process.env.APP_PUBLIC_URL, "http://localhost:5173/roots");
    assert.equal(stored.has("APP_PUBLIC_URL"), false);
    assert.equal(process.env.GOOGLE_CALLBACK_URL, "http://localhost:5173/roots/api/auth/google/callback");
  } finally {
    for (const key of tracked) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});
