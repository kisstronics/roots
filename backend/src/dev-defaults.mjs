export function applyDevDefaults() {
  if (!process.env.APP_PUBLIC_URL) {
    process.env.APP_PUBLIC_URL = "http://localhost:5173/roots";
  }
  if (!process.env.GOOGLE_CALLBACK_URL) {
    process.env.GOOGLE_CALLBACK_URL = `${process.env.APP_PUBLIC_URL.replace(/\/$/, "")}/api/auth/google/callback`;
  }
  if (!process.env.SESSION_SECRET) {
    process.env.SESSION_SECRET = "dev-only-change-me";
    console.warn("SESSION_SECRET is not set. Using a development secret.");
  }
}
