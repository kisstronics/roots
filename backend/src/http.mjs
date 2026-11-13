export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function send(res, status, body) {
  res.status(status).type("application/json").send(body);
}

export function asyncRoute(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      if (error instanceof HttpError) {
        send(res, error.status, { error: error.message });
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

export function writeCookie(res, name, value, { maxAge, secure = process.env.COOKIE_SECURE === "true" } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  if (secure) parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

export function clearCookie(res, name) {
  writeCookie(res, name, "", { maxAge: 0 });
}

export function publicBase(req) {
  const configured = (process.env.APP_PUBLIC_URL || "").replace(/\/$/, "");
  const host = req.get("host") || "";
  const live = host ? `${req.protocol}://${host}/roots` : "";
  if (live && !isLocalUrl(live) && (!configured || isLocalUrl(configured))) return live;
  if (configured) return configured;
  return live;
}

export function configuredOrLive(req, envValue, suffix) {
  const configured = (envValue || "").trim();
  const base = publicBase(req);
  if (!configured || (isLocalUrl(configured) && !isLocalUrl(base))) return `${base}${suffix}`;
  return configured;
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
