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

test("a local runtime uses local urls and leaves the database url alone", async () => {
  const tracked = [...APP_SETTING_KEYS, "DATABASE_URL", "NODE_ENV", "RENDER", "RENDER_SERVICE_ID"];
  const saved = Object.fromEntries(tracked.map((key) => [key, process.env[key]]));
  for (const key of [...APP_SETTING_KEYS, "NODE_ENV", "RENDER", "RENDER_SERVICE_ID"]) delete process.env[key];
  process.env.DATABASE_URL = "postgres://remote-keep";
  process.env.APP_PUBLIC_URL = "http://localhost:5173/roots";
  process.env.GOOGLE_CALLBACK_URL = "http://localhost:5173/roots/api/auth/google/callback";
  process.env.COOKIE_SECURE = "false";

  const stored = new Map([
    ["APP_PUBLIC_URL", "https://roots.sknics.com/roots"],
    ["GOOGLE_CALLBACK_URL", "https://api.sknics.com/api/auth/google/callback"],
    ["APP_HOSTS", "roots.sknics.com"],
    ["COOKIE_SECURE", "true"],
    ["SMTP_HOST", "smtp.gmail.com"],
  ]);

  try {
    await loadAppSettings(settingsClient(stored));
    assert.equal(process.env.DATABASE_URL, "postgres://remote-keep");
    assert.equal(process.env.APP_PUBLIC_URL, "http://localhost:5173/roots");
    assert.equal(process.env.GOOGLE_CALLBACK_URL, "http://localhost:5173/roots/api/auth/google/callback");
    assert.equal(process.env.APP_HOSTS, "localhost");
    assert.equal(process.env.COOKIE_SECURE, "false");
    assert.equal(process.env.SMTP_HOST, "smtp.gmail.com");
    assert.equal(stored.get("APP_PUBLIC_URL"), "https://roots.sknics.com/roots");
    assert.equal(stored.get("GOOGLE_CALLBACK_URL"), "https://api.sknics.com/api/auth/google/callback");
    assert.equal(stored.get("APP_HOSTS"), "roots.sknics.com");
    assert.equal(stored.get("COOKIE_SECURE"), "true");
  } finally {
    restoreEnv(tracked, saved);
  }
});

test("production keeps the urls stored with the database", async () => {
  const tracked = [...APP_SETTING_KEYS, "DATABASE_URL", "NODE_ENV"];
  const saved = Object.fromEntries(tracked.map((key) => [key, process.env[key]]));
  for (const key of APP_SETTING_KEYS) delete process.env[key];
  process.env.NODE_ENV = "production";
  process.env.DATABASE_URL = "postgres://remote-keep";
  process.env.APP_PUBLIC_URL = "http://localhost:5173/roots";
  process.env.GOOGLE_CALLBACK_URL = "http://localhost:5173/roots/api/auth/google/callback";

  const stored = new Map([
    ["APP_PUBLIC_URL", "https://roots.sknics.com/roots"],
    ["GOOGLE_CALLBACK_URL", "https://api.sknics.com/api/auth/google/callback"],
    ["APP_HOSTS", "roots.sknics.com"],
    ["COOKIE_SECURE", "true"],
  ]);

  try {
    await loadAppSettings(settingsClient(stored));
    assert.equal(process.env.DATABASE_URL, "postgres://remote-keep");
    assert.equal(process.env.APP_PUBLIC_URL, "https://roots.sknics.com/roots");
    assert.equal(process.env.GOOGLE_CALLBACK_URL, "https://api.sknics.com/api/auth/google/callback");
    assert.equal(process.env.APP_HOSTS, "roots.sknics.com");
    assert.equal(process.env.COOKIE_SECURE, "true");
  } finally {
    restoreEnv(tracked, saved);
  }
});

function settingsClient(stored) {
  return {
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
}

function restoreEnv(tracked, saved) {
  for (const key of tracked) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}
