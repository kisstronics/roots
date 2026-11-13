const base = import.meta.env.BASE_URL.replace(/\/$/, "");

export function appUrl(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}
