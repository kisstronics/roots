export const LOCAL_APP_URL = "http://localhost:5173/roots";

export const LOCAL_URL_KEYS = ["APP_PUBLIC_URL", "GOOGLE_CALLBACK_URL", "APP_HOSTS", "COOKIE_SECURE"];

export function isLocalRuntime() {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.RENDER || process.env.RENDER_SERVICE_ID) return false;
  return true;
}

export function applyLocalUrls(fromEnv = {}) {
  if (!isLocalRuntime()) return false;
  const preferred = typeof fromEnv.APP_PUBLIC_URL === "string" ? fromEnv.APP_PUBLIC_URL.replace(/\/$/, "") : "";
  const appUrl = preferred && isLocalUrl(preferred) ? preferred : LOCAL_APP_URL;
  const callback = typeof fromEnv.GOOGLE_CALLBACK_URL === "string" ? fromEnv.GOOGLE_CALLBACK_URL.trim() : "";
  process.env.APP_PUBLIC_URL = appUrl;
  process.env.GOOGLE_CALLBACK_URL = callback && isLocalUrl(callback) ? callback : `${appUrl}/api/auth/google/callback`;
  process.env.APP_HOSTS = "localhost";
  process.env.COOKIE_SECURE = "false";
  return true;
}

export function applyDevDefaults() {
  if (!process.env.APP_PUBLIC_URL) {
    process.env.APP_PUBLIC_URL = LOCAL_APP_URL;
  }
  if (!process.env.GOOGLE_CALLBACK_URL) {
    process.env.GOOGLE_CALLBACK_URL = `${process.env.APP_PUBLIC_URL.replace(/\/$/, "")}/api/auth/google/callback`;
  }
  if (!process.env.SESSION_SECRET) {
    process.env.SESSION_SECRET = "dev-only-change-me";
    console.warn("SESSION_SECRET is not set. Using a development secret.");
  }
}

function isLocalUrl(value) {
  try {
    const host = new URL(value).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}
