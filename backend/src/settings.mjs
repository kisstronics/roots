import { applyDevDefaults, applyLocalUrls, isLocalRuntime, LOCAL_URL_KEYS } from "./dev-defaults.mjs";

export const APP_SETTING_KEYS = [
  "SESSION_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_CALLBACK_URL",
  "APP_PUBLIC_URL",
  "ADMIN_EMAIL",
  "APP_HOSTS",
  "COOKIE_SECURE",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "MAIL_FROM",
];

export async function loadAppSettings(client) {
  const local = isLocalRuntime();
  const localSnapshot = {};
  if (local) {
    for (const key of LOCAL_URL_KEYS) {
      if (process.env[key] !== undefined) localSnapshot[key] = process.env[key];
    }
  }
  const missingKeys = [];
  const missingValues = [];
  const current = await readSettings(client);
  for (const key of APP_SETTING_KEYS) {
    if (current.has(key)) continue;
    if (local && LOCAL_URL_KEYS.includes(key)) continue;
    const value = process.env[key];
    if (!value) continue;
    missingKeys.push(key);
    missingValues.push(value);
  }
  if (missingKeys.length) {
    await client.query(
      `INSERT INTO app_settings (key, value)
       SELECT seed.key, seed.value
       FROM unnest($1::text[], $2::text[]) AS seed(key, value)
       ON CONFLICT (key) DO NOTHING`,
      [missingKeys, missingValues],
    );
  }
  const settings = await readSettings(client);
  for (const key of APP_SETTING_KEYS) {
    if (!settings.has(key)) continue;
    process.env[key] = settings.get(key);
  }
  if (applyLocalUrls(localSnapshot)) {
    console.log("Local runtime is using local app URLs. The database connection is unchanged.");
  }
  applyDevDefaults();
  const loaded = APP_SETTING_KEYS.filter((key) => settings.has(key)).length;
  console.log(`Loaded ${loaded} backend settings from app_settings.`);
}

async function readSettings(client) {
  const { rows } = await client.query(
    "SELECT key, value FROM app_settings WHERE key = ANY($1::text[])",
    [APP_SETTING_KEYS],
  );
  return new Map(rows.map((row) => [row.key, row.value ?? ""]));
}
