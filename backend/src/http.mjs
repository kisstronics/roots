export class HttpError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function send(res, status, body) {
  res.status(status).type("application/json").send(body);
}

export function asyncRoute(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      if (error instanceof HttpError) {
        send(res, error.status, { error: error.message, ...(error.details || {}) });
        return;
      }
      console.error(error);
      send(res, 500, { error: "The server could not finish that request." });
    });
  };
}

export function readCookie(req, name) {
  const header = req.headers.cookie ?? "";
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return "";
    }
  }
  return "";
}

export function writeCookie(res, name, value, { maxAge, secure = process.env.COOKIE_SECURE === "true", sameSite = "Lax" } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", `SameSite=${sameSite}`];
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  if (secure || sameSite === "None") parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

export function clearCookie(res, name, options = {}) {
  writeCookie(res, name, "", { maxAge: 0, ...options });
}

export function cookieFlags(req) {
  const host = hostnameOf(req.get("host") || "");
  if (host.endsWith(".onrender.com")) return { secure: true, sameSite: "None" };
  return { secure: process.env.COOKIE_SECURE === "true", sameSite: "Lax" };
}

const DEFAULT_APP_HOSTS = ["roots-8rak.vercel.app"];

export function publicBase(req) {
  const forwarded = forwardedAppBase(req);
  if (forwarded) return forwarded;
  const configured = (process.env.APP_PUBLIC_URL || "").replace(/\/$/, "");
  const host = req.get("host") || "";
  const hostname = hostnameOf(host);
  if (hostname.endsWith(".onrender.com")) {
    if (configured && !isLocalUrl(configured) && hostnameOf(configured) !== hostname) return configured;
    return `https://${DEFAULT_APP_HOSTS[0]}/roots`;
  }
  const live = host ? `${req.protocol}://${host}/roots` : "";
  if (live && !isLocalUrl(live) && (!configured || isLocalUrl(configured))) return live;
  if (configured) return configured;
  return live;
}

export function googleCallbackUrl(req) {
  const configured = (process.env.GOOGLE_CALLBACK_URL || "").trim();
  if (configured && !isLocalUrl(configured)) return configured;
  const host = req.get("host") || "";
  if (host && !isLocalUrl(`https://${host}`)) return `${req.protocol}://${host}/api/auth/google/callback`;
  return configuredOrLive(req, configured, "/api/auth/google/callback");
}

export function allowAppOrigin(req, res) {
  const origin = req.get("origin");
  if (!origin || !allowedAppHosts().has(hostnameOf(origin))) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.append("Vary", "Origin");
}

export function configuredOrLive(req, envValue, suffix) {
  const configured = (envValue || "").trim();
  const base = publicBase(req);
  if (!configured || (isLocalUrl(configured) && !isLocalUrl(base))) return `${base}${suffix}`;
  return configured;
}

function forwardedAppBase(req) {
  const raw = req.get("x-forwarded-host") || req.get("x-vercel-forwarded-host") || "";
  const host = raw.split(",")[0].trim();
  const hostname = hostnameOf(host);
  if (!hostname || !allowedAppHosts().has(hostname)) return "";
  const proto = (req.get("x-forwarded-proto") || req.protocol || "https").split(",")[0].trim();
  return `${proto}://${host}/roots`;
}

function allowedAppHosts() {
  const hosts = new Set(DEFAULT_APP_HOSTS);
  for (const host of (process.env.APP_HOSTS || "").split(",")) {
    const hostname = hostnameOf(host.trim());
    if (hostname) hosts.add(hostname);
  }
  const configured = (process.env.APP_PUBLIC_URL || "").trim();
  if (configured && !isLocalUrl(configured)) {
    const hostname = hostnameOf(configured);
    if (hostname) hosts.add(hostname);
  }
  return hosts;
}

function hostnameOf(value) {
  if (!value) return "";
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname;
  } catch {
    return "";
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

export function redirectApp(res, req, path) {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  res.redirect(302, `${publicBase(req)}${suffix}`);
}
