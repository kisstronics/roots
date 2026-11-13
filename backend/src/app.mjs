import { randomBytes, timingSafeEqual } from "node:crypto";
import express from "express";
import { isSiteAdmin } from "./admin.mjs";
import {
  cleanName,
  cleanPeople,
  countOwned,
  createFamily,
  deleteFamily,
  ensureShareToken,
  findUserById,
  getByShareToken,
  getCatalog,
  getEditable,
  initDb,
  listCatalog,
  listForUser,
  mapFamily,
  maxFamilies,
  summarize,
  updateFamily,
  upsertGoogleUser,
} from "./db.mjs";
import {
  asyncRoute,
  clearCookie,
  HttpError,
  publicBase,
  readCookie,
  redirectApp,
  send,
  writeCookie,
} from "./http.mjs";
import { sendFamilyCreatedEmail, sendWelcomeEmail } from "./mail.mjs";
import { OAUTH_COOKIE, SESSION_COOKIE, sign, verify } from "./session.mjs";
import { isSafeSlug, slugify } from "./slug.mjs";

const SESSION_SECONDS = 60 * 60 * 24 * 14;
const OAUTH_SECONDS = 60 * 10;
const SHARE_TOKEN = /^[A-Za-z0-9_-]{20,200}$/;

export async function attachApi(app) {
  app.locals.dbReady = false;
  try {
    await initDb();
    app.locals.dbReady = true;
    console.log("PostgreSQL is ready.");
  } catch (error) {
    console.error("PostgreSQL is not available:", error.message);
  }
  const router = createRouter();
  app.use("/api", router);
  app.use("/roots/api", router);
}

function createRouter() {
  const router = express.Router();

  router.use((req, res, next) => {
    if (req.app.locals.dbReady) {
      next();
      return;
    }
    if (req.path === "/health") {
      send(res, 200, { ok: false, database: false });
      return;
    }
    if (req.path === "/auth/me") {
      send(res, 200, { user: null });
      return;
    }
    if (req.path === "/auth/google" || req.path === "/auth/google/callback") {
      redirectApp(res, req, "/login?error=database");
      return;
    }
    send(res, 503, { error: "The database is not available." });
  });

  router.get("/health", (_req, res) => {
    send(res, 200, { ok: true, database: true });
  });

  router.get("/auth/google", (req, res) => {
    const google = googleConfig();
    const mode = req.query.mode === "signup" ? "signup" : "login";
    if (!google) {
      redirectApp(res, req, `/${mode}?error=not-configured`);
      return;
    }
    const state = randomBytes(16).toString("base64url");
    writeCookie(res, OAUTH_COOKIE, sign({ state, mode, exp: Date.now() + OAUTH_SECONDS * 1000 }), {
      maxAge: OAUTH_SECONDS,
    });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", google.clientId);
    url.searchParams.set("redirect_uri", googleCallbackUrl(req));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "select_account");
    res.redirect(302, url.toString());
  });

  router.get(
    "/auth/google/callback",
    asyncRoute(async (req, res) => {
      const payload = verify(readCookie(req, OAUTH_COOKIE));
      const mode = payload?.mode === "signup" ? "signup" : "login";
      clearCookie(res, OAUTH_COOKIE);
      const fail = (code) => redirectApp(res, req, `/${mode}?error=${code}`);
      if (!payload?.state || !safeEqual(payload.state, req.query.state)) {
        fail("google");
        return;
      }
      if (req.query.error) {
        fail("denied");
        return;
      }
      const google = googleConfig();
      const code = typeof req.query.code === "string" ? req.query.code : "";
      if (!google || !code) {
        fail(google ? "google" : "not-configured");
        return;
      }
      const profile = await exchangeGoogleCode(google, code, googleCallbackUrl(req));
      if (!profile) {
        fail("google");
        return;
      }
      if (profile.email_verified === false) {
        fail("verify");
        return;
      }
      const email = String(profile.email || "").trim().toLowerCase();
      if (!profile.sub || !email) {
        fail("google");
        return;
      }
      const { user, created } = await upsertGoogleUser({
        sub: profile.sub,
        email,
        name: String(profile.name || email).slice(0, 120),
        picture: typeof profile.picture === "string" ? profile.picture : null,
      });
      if (created) await notify(() => sendWelcomeEmail(user));
      writeCookie(res, SESSION_COOKIE, sign({ uid: user.id, exp: Date.now() + SESSION_SECONDS * 1000 }), {
        maxAge: SESSION_SECONDS,
      });
      redirectApp(res, req, "/admin");
    }),
  );

  router.get(
    "/auth/me",
    asyncRoute(async (req, res) => {
      const user = await userFromSession(req);
      send(res, 200, { user: user ? publicUser(user) : null });
    }),
  );

  router.post("/auth/logout", (_req, res) => {
    clearCookie(res, SESSION_COOKIE);
    send(res, 200, { ok: true });
  });

  router.get(
    "/families/public",
    asyncRoute(async (_req, res) => {
      const families = (await listCatalog()).map(summarize);
      send(res, 200, { families });
    }),
  );

  router.get(
    "/families/public/:slug",
    asyncRoute(async (req, res) => {
      const slug = String(req.params.slug || "").toLowerCase();
      if (!isSafeSlug(slug)) {
        send(res, 404, { error: "That family was not found." });
        return;
      }
      const row = await getCatalog(slug);
      if (!row) {
        send(res, 404, { error: "That family was not found." });
        return;
      }
      send(res, 200, { family: mapFamily(row) });
    }),
  );

  router.get("/families", requireUser, asyncRoute(async (req, res) => {
    const [rows, limit, familyCount] = await Promise.all([
      listForUser(req.user),
      maxFamilies(),
      countOwned(req.user.id),
    ]);
    send(res, 200, {
      families: rows.map(summarize),
      maxFamilies: limit,
      familyCount,
      siteAdmin: isSiteAdmin(req.user),
    });
  }));

  router.post("/families", requireUser, asyncRoute(async (req, res) => {
    const name = cleanName(req.body?.name);
    const slug = slugify(name);
    if (!isSafeSlug(slug)) throw new HttpError(400, "Use a family name with letters or numbers.");
    const row = await createFamily(req.user.id, { slug, name });
    await notify(() => sendFamilyCreatedEmail(req.user, row));
    send(res, 201, { family: mapFamily(row), shareToken: null });
  }));

  router.get("/families/:slug", requireUser, asyncRoute(async (req, res) => {
    const row = await editableOr404(req);
    send(res, 200, { family: mapFamily(row), shareToken: row.share_token, publicTree: row.is_catalog });
  }));

  router.put("/families/:slug", requireUser, asyncRoute(async (req, res) => {
    const row = await editableOr404(req);
    const name = cleanName(req.body?.name ?? row.name);
    const people = cleanPeople(req.body?.people);
    const saved = await updateFamily(req.user, row.slug, { name, people });
    send(res, 200, { ok: true, family: mapFamily(saved) });
  }));

  router.delete("/families/:slug", requireUser, asyncRoute(async (req, res) => {
    const row = await editableOr404(req);
    await deleteFamily(req.user, row.slug);
    send(res, 200, { ok: true });
  }));

  router.post("/families/:slug/share", requireUser, asyncRoute(async (req, res) => {
    const row = await editableOr404(req);
    const shareToken = await ensureShareToken(req.user, row.slug);
    send(res, 200, { shareToken, path: `/share/${shareToken}` });
  }));

  router.get(
    "/share/:token",
    asyncRoute(async (req, res) => {
      const token = String(req.params.token || "");
      if (!SHARE_TOKEN.test(token)) {
        send(res, 404, { error: "This link does not open a family." });
        return;
      }
      const row = await getByShareToken(token);
      if (!row) {
        send(res, 404, { error: "This link does not open a family." });
        return;
      }
      send(res, 200, { family: mapFamily(row) });
    }),
  );

  return router;
}

function requireUser(req, res, next) {
  userFromSession(req)
    .then((user) => {
      if (!user) {
        send(res, 401, { error: "Sign in to continue." });
        return;
      }
      req.user = user;
      next();
    })
    .catch((error) => {
      console.error(error);
      send(res, 500, { error: "The server could not finish that request." });
    });
}

async function userFromSession(req) {
  const payload = verify(readCookie(req, SESSION_COOKIE));
  if (!payload?.uid || typeof payload.uid !== "string") return null;
  return findUserById(payload.uid);
}

async function editableOr404(req) {
  const slug = String(req.params.slug || "").toLowerCase();
  if (!isSafeSlug(slug)) throw new HttpError(404, "That family was not found.");
  const row = await getEditable(req.user, slug);
  if (!row) throw new HttpError(404, "That family was not found.");
  return row;
}

function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

function googleCallbackUrl(req) {
  if (process.env.GOOGLE_CALLBACK_URL) return process.env.GOOGLE_CALLBACK_URL;
  return `${publicBase(req)}/api/auth/google/callback`;
}

async function exchangeGoogleCode(google, code, redirectUri) {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: google.clientId,
      client_secret: google.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const token = await tokenResponse.json().catch(() => null);
  if (!tokenResponse.ok || !token?.access_token) {
    console.error("Google token exchange failed", tokenResponse.status, token?.error || "");
    return null;
  }
  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const profile = await profileResponse.json().catch(() => null);
  if (!profileResponse.ok || !profile) {
    console.error("Google profile request failed", profileResponse.status);
    return null;
  }
  return profile;
}

function safeEqual(left, right) {
  if (typeof right !== "string") return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function notify(send) {
  try {
    await send();
  } catch (error) {
    console.error("Email failed:", error.message);
  }
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
  };
}
