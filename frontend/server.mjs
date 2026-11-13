import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { attachApi } from "../backend/src/app.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(root, "dist");
const familiesDir = path.join(root, "public", "families");
const enquiriesFile = path.join(root, "data", "enquiries.json");
const port = 5173;
const appBase = "/roots";
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const env = loadEnvFile(path.join(root, ".env"));
const app = express();

app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(express.json({ limit: "8mb" }));
await attachApi(app);

app.post(["/__admin/login", `${appBase}/__admin/login`], (req, res) => {
  const expectedUser = env.ADMIN_USERNAME ?? "";
  const expectedPassword = env.ADMIN_PASSWORD ?? "";
  if (!expectedUser || !expectedPassword) {
    send(res, 503, { error: "Admin login is not configured." });
    return;
  }
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (username !== expectedUser || password !== expectedPassword) {
    send(res, 401, { error: "Those credentials do not match the admin user." });
    return;
  }
  send(res, 200, { ok: true, username });
});

app.post(["/__contact", `${appBase}/__contact`], (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
  const enquiry = typeof req.body?.enquiry === "string" ? req.body.enquiry.trim() : "";
  const problem = enquiryProblem(email, phone, enquiry);
  if (problem) {
    send(res, 400, { error: problem });
    return;
  }
  const current = readEnquiries();
  current.push({
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    email,
    phone,
    enquiry,
    createdAt: new Date().toISOString(),
  });
  fs.mkdirSync(path.dirname(enquiriesFile), { recursive: true });
  fs.writeFileSync(enquiriesFile, `${JSON.stringify(current, null, 2)}\n`);
  send(res, 200, { ok: true });
});

app.post(["/__families/save", `${appBase}/__families/save`], (req, res) => {
  const family = req.body ?? {};
  if (!family.slug || !slugPattern.test(family.slug) || family.slug === "index") {
    send(res, 400, { error: "Family address is not valid." });
    return;
  }
  if (!family.name?.trim() || !Array.isArray(family.people)) {
    send(res, 400, { error: "Family file is incomplete." });
    return;
  }
  fs.mkdirSync(familiesDir, { recursive: true });
  const file = path.join(familiesDir, `${family.slug}.json`);
  fs.writeFileSync(file, `${JSON.stringify(family, null, 2)}\n`);
  writeIndex();
  send(res, 200, { ok: true, file: `public/families/${family.slug}.json` });
});

app.post(["/__families/delete", `${appBase}/__families/delete`], (req, res) => {
  const slug = req.body?.slug;
  if (!slug || !slugPattern.test(slug) || slug === "index") {
    send(res, 400, { error: "Family address is not valid." });
    return;
  }
  const file = path.join(familiesDir, `${slug}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  writeIndex();
  send(res, 200, { ok: true });
});

app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    next();
    return;
  }
  const match = stripBase(req.path).match(/^\/families\/([a-z0-9-]+)\.json$/i);
  if (!match) {
    next();
    return;
  }
  const requested = match[1].toLowerCase();
  if (requested !== "index" && !slugPattern.test(requested)) {
    next();
    return;
  }
  const file = resolveFamilyJson(`${requested}.json`);
  if (!file) {
    send(res, 404, { error: "Not found" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.type("application/json");
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.sendFile(file);
});

app.use(appBase, express.static(distDir));

app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    next();
    return;
  }
  if (req.path === appBase || req.path.startsWith(`${appBase}/`)) {
    next();
    return;
  }
  if (req.path.startsWith("/families/") || req.path.startsWith("/__")) {
    next();
    return;
  }
  res.redirect(302, req.path === "/" ? `${appBase}/` : `${appBase}${req.path}`);
});

app.use(appBase, (req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    next();
    return;
  }
  res.sendFile(path.join(distDir, "index.html"), (error) => {
    if (error) next(error);
  });
});

app.use((error, _req, res, _next) => {
  if (error?.type === "entity.too.large") {
    send(res, 400, { error: "Family file is too large." });
    return;
  }
  if (error instanceof SyntaxError && "body" in error) {
    send(res, 400, { error: "Could not read the request." });
    return;
  }
  send(res, 500, { error: "The server could not finish that request." });
});

if (!fs.existsSync(path.join(distDir, "index.html"))) {
  console.error("Build not found. Run npm run build first.");
  process.exit(1);
}

app.listen(port, "0.0.0.0", () => {
  console.log(`Our Roots is serving the build at http://127.0.0.1:${port}${appBase}/`);
});

function stripBase(urlPath) {
  if (urlPath === appBase) return "/";
  if (urlPath.startsWith(`${appBase}/`)) return urlPath.slice(appBase.length);
  return urlPath;
}

function loadEnvFile(file) {
  const values = {};
  if (!fs.existsSync(file)) return values;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function enquiryProblem(email, phone, enquiry) {
  if (!email && !phone) return "Enter an email or a phone number.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "That email does not look right.";
  if (phone && !/^\+?[0-9][0-9\s().-]{6,20}$/.test(phone)) return "That phone number does not look right.";
  if (!enquiry) return "Write a short enquiry.";
  if (enquiry.length > 2000) return "Keep the enquiry under 2000 characters.";
  return null;
}

function readEnquiries() {
  if (!fs.existsSync(enquiriesFile)) return [];
  const parsed = JSON.parse(fs.readFileSync(enquiriesFile, "utf8"));
  return Array.isArray(parsed) ? parsed : [];
}

function resolveFamilyJson(fileName) {
  if (!fs.existsSync(familiesDir)) return null;
  const wanted = fileName.toLowerCase();
  const match = fs.readdirSync(familiesDir).find((file) => file.toLowerCase() === wanted);
  return match ? path.join(familiesDir, match) : null;
}

function writeIndex() {
  const files = fs.readdirSync(familiesDir).filter((file) => file.endsWith(".json") && file !== "index.json");
  const families = files
    .map((file) => {
      const data = JSON.parse(fs.readFileSync(path.join(familiesDir, file), "utf8"));
      return { slug: data.slug, name: data.name, people: data.people?.length ?? 0 };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(path.join(familiesDir, "index.json"), `${JSON.stringify({ families }, null, 2)}\n`);
}

function send(res, status, body) {
  res.status(status).type("application/json").send(body);
}
