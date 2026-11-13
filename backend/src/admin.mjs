export function isSiteAdmin(user) {
  const email = String(user?.email ?? "").trim().toLowerCase();
  if (!email) return false;
  const allowed = String(process.env.ADMIN_EMAIL ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email);
}
