import { randomBytes, timingSafeEqual } from "node:crypto";
import express from "express";
import { isSiteAdmin } from "./admin.mjs";
import {
  cleanName,
  cleanPeople,
  cleanPerson,
  countOwned,
  createFamily,
  deleteFamily,
  ensureShareToken,
  ensureViewToken,
  findUserById,
  getCatalog,
  getReadable,
  lookupShare,
  initDb,
  listCatalog,
  listForUser,
  mapFamily,
  maxFamilies,
  summarize,
  updatePerson,
  updateStructure,
  upsertGoogleUser,
} from "./db.mjs";
import {
  asyncRoute,
  allowAppOrigin,
  clearCookie,
  cookieFlags,
  HttpError,
  googleCallbackUrl,
  readCookie,
  redirectApp,
  send,
  writeCookie,
} from "./http.mjs";
import { sendFamilyCreatedEmail, sendShareEmail, sendTreeUpdatedEmails, sendWelcomeEmail } from "./mail.mjs";
import {
  changeMember,
  claimInvites,
  createLink,
  grantMember,
  listAccessEvents,
  listEdits,
  listLinks,
  listMembers,
  listUpdateRecipients,
  recordAccess,
  recordEdit,
  removeMember,
  revokeLink,
} from "./access.mjs";
import { OAUTH_COOKIE, SESSION_COOKIE, sign, verify } from "./session.mjs";
import { isSafeSlug, slugify } from "./slug.mjs";

const SESSION_SECONDS = 60 * 60 * 24 * 14;
const OAUTH_SECONDS = 60 * 10;
const SHARE_TOKEN = /^[A-Za-z0-9_-]{20,200}$/;

export async function attachApi(app) {
  app.use((req, res, next) => {
    allowAppOrigin(req, res);
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });
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
      ...cookieFlags(req),
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
      clearCookie(res, OAUTH_COOKIE, cookieFlags(req));
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
      await claimInvites(user);
      if (created) await notify(() => sendWelcomeEmail(user));
      writeCookie(res, SESSION_COOKIE, sign({ uid: user.id, exp: Date.now() + SESSION_SECONDS * 1000 }), {
        maxAge: SESSION_SECONDS,
        ...cookieFlags(req),
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

  router.post("/auth/logout", (req, res) => {
    clearCookie(res, SESSION_COOKIE, cookieFlags(req));
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
      send(res, 200, { family: await mapFamily(row) });
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
    send(res, 201, { family: await mapFamily(row), shareToken: null });
  }));

  router.get("/families/:slug", requireUser, asyncRoute(async (req, res) => {
    const row = await readableOr404(req);
    send(res, 200, await familyPayload(req.user, row));
  }));

  router.put("/families/:slug/people/:personId", requireUser, asyncRoute(async (req, res) => {
    const row = await editableFamily(req);
    const profile = cleanPerson(req.body);
    const saved = await updatePerson(req.user, row.slug, req.params.personId, profile);
    if (saved.changed) await notifyEditors(req, row);
    send(res, 200, { ok: true, updatedAt: new Date(row.structure_updated_at || row.updated_at).toISOString() });
  }));

  router.put("/families/:slug/structure", requireUser, asyncRoute(async (req, res) => {
    const row = await editableFamily(req);
    const name = cleanName(req.body?.name ?? row.name);
    const saved = await updateStructure(req.user, row.slug, {
      name,
      structure: req.body?.structure,
      people: cleanPeople(req.body?.people),
      baseUpdatedAt: req.body?.baseUpdatedAt,
    });
    if (saved.changed) await notifyEditors(req, saved.row);
    send(res, 200, { ok: true, family: await mapFamily(saved.row) });
  }));

  router.put("/families/:slug", requireUser, asyncRoute(async () => {
    throw new HttpError(409, "Reload this tree before saving. Person details and the tree structure are saved separately.");
  }));

  router.delete("/families/:slug", requireUser, asyncRoute(async (req, res) => {
    const row = await readableOr404(req);
    await deleteFamily(req.user, row.slug);
    await recordAccess(req.user, row.id, "deleted");
    send(res, 200, { ok: true });
  }));

  router.post("/families/:slug/members", requireUser, asyncRoute(async (req, res) => {
    const row = await readableOr404(req);
    const member = await grantMember(req.user, row, req.body?.email, req.body?.role);
    await notify(() =>
      sendShareEmail({
        email: member.email,
        name: member.name,
        family: row,
        role: member.role,
        inviter: req.user,
        pending: member.pending,
      }),
    );
    send(res, 200, { member, members: await listMembers(row.id), accessLog: await listAccessEvents(row.id) });
  }));

  router.put("/families/:slug/members/:userId", requireUser, asyncRoute(async (req, res) => {
    const row = await readableOr404(req);
    await changeMember(req.user, row, req.params.userId, req.body?.role);
    send(res, 200, { members: await listMembers(row.id), accessLog: await listAccessEvents(row.id) });
  }));

  router.delete("/families/:slug/members/:userId", requireUser, asyncRoute(async (req, res) => {
    const row = await readableOr404(req);
    await removeMember(req.user, row, req.params.userId);
    send(res, 200, { members: await listMembers(row.id), accessLog: await listAccessEvents(row.id) });
  }));

  router.post("/families/:slug/links", requireUser, asyncRoute(async (req, res) => {
    const row = await readableOr404(req);
    const link = await createLink(req.user, row, req.body?.expiry);
    send(res, 201, {
      link,
      path: `/share/${link.token}`,
      links: await listLinks(req.user.id, row.id),
      accessLog: await listAccessEvents(row.id),
    });
  }));

  router.delete("/families/:slug/links/:linkId", requireUser, asyncRoute(async (req, res) => {
    const row = await readableOr404(req);
    await revokeLink(req.user, row, req.params.linkId);
    send(res, 200, { links: await listLinks(req.user.id, row.id), accessLog: await listAccessEvents(row.id) });
  }));

  router.post("/families/:slug/view-link", requireUser, asyncRoute(async (req, res) => {
    const row = await readableOr404(req);
    const view = await ensureViewToken(req.user, row.slug);
    if (view.created) await recordAccess(req.user, row.id, "view_link");
    send(res, 200, { shareToken: view.token, path: `/share/${view.token}`, accessLog: await listAccessEvents(row.id) });
  }));

  router.post("/families/:slug/share", requireUser, asyncRoute(async (req, res) => {
    const row = await readableOr404(req);
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
      const found = await lookupShare(token);
      if (found?.expired) {
        send(res, 410, { error: "This link has expired." });
        return;
      }
      if (!found?.row) {
        send(res, 404, { error: "This link does not open a family." });
        return;
      }
      send(res, 200, { family: await mapFamily(found.row) });
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

async function editableFamily(req) {
  const row = await readableOr404(req);
  if (row.access_role === "viewer") throw new HttpError(403, "You can view this tree, but only an editor can change it.");
  return row;
}

async function notifyEditors(req, family) {
  const changed = await recordEdit(req.user, family.id);
  if (!changed) return;
  const recipients = await listUpdateRecipients(family.id, req.user.id);
  await notify(() => sendTreeUpdatedEmails(recipients, family, req.user));
}

async function readableOr404(req) {
  const slug = String(req.params.slug || "").toLowerCase();
  if (!isSafeSlug(slug)) throw new HttpError(404, "That family was not found.");
  const row = await getReadable(req.user, slug);
  if (!row) throw new HttpError(404, "That family was not found.");
  return row;
}

async function familyPayload(user, row) {
  const [members, links, edits, accessLog] = await Promise.all([
    listMembers(row.id),
    listLinks(user.id, row.id),
    listEdits(row.id),
    listAccessEvents(row.id),
  ]);
  return {
    family: await mapFamily(row),
    role: row.access_role,
    viewToken: row.share_token,
    members,
    links,
    edits,
    accessLog,
  };
}

function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
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
