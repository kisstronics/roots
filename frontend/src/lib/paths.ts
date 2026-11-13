const base = import.meta.env.BASE_URL.replace(/\/$/, "");
const RENDER_API = "https://roots-lalt.onrender.com";

export function appUrl(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

export function apiUrl(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const configured = (import.meta.env.VITE_API_ORIGIN || "").replace(/\/$/, "");
  const onVercel = typeof window !== "undefined" && window.location.hostname.endsWith(".vercel.app");
  const origin = configured || (onVercel ? RENDER_API : "");
  if (!origin) return `${base}${suffix}`;
  return `${origin}${suffix}`;
}
