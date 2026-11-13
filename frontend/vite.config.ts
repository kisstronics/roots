import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Connect, type Plugin } from "vite";

const API_TARGET = process.env.API_PROXY_TARGET || "http://127.0.0.1:3001";
const FAMILIES_DIR = path.resolve("public/families");
const ENQUIRIES_FILE = path.resolve("data/enquiries.json");
const APP_BASE = "/roots";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default defineConfig({
  base: `${APP_BASE}/`,
  plugins: [react(), baseRedirectPlugin(), familyFilesPlugin(), adminLoginPlugin(), contactPlugin()],
  server: {
    allowedHosts: ["carline-pachydermoid-jadon.ngrok-free.dev"],
    proxy: apiProxy(),
    watch: {
      ignored: ["**/public/families/**", "**/data/**"],
    },
  },
  preview: {
    proxy: apiProxy(),
  },
});

function apiProxy() {
  return {
    "/roots/api": {
      target: API_TARGET,
      changeOrigin: true,
      rewrite: (requestPath: string) => requestPath.replace(/^\/roots/, ""),
    },
  };
}

function stripBase(url: string): string {
  if (url === APP_BASE) return "/";
  if (url.startsWith(`${APP_BASE}/`)) return url.slice(APP_BASE.length);
  return url;
}

function baseRedirectPlugin(): Plugin {
  const attach = (middlewares: Connect.Server) => {
    middlewares.use((req, res, next) => {
      const url = req.url?.split("?")[0] ?? "";
      if ((req.method === "GET" || req.method === "HEAD") && url === "/") {
        const query = req.url?.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
        res.statusCode = 302;
        res.setHeader("Location", `${APP_BASE}/${query}`);
        res.end();
        return;
      }
      next();
    });
  };
  return {
    name: "base-redirect",
    configureServer(server) {
      attach(server.middlewares);
    },
    configurePreviewServer(server) {
      attach(server.middlewares);
    },
  };
}

function adminLoginPlugin(): Plugin {
  return {
    name: "admin-login",
    configureServer(server) {
      attachAdminLogin(server.middlewares, server.config.mode, server.config.root);
    },
    configurePreviewServer(server) {
      attachAdminLogin(server.middlewares, server.config.mode, server.config.root);
    },
  };
}

function attachAdminLogin(middlewares: Connect.Server, mode: string, root: string) {
  middlewares.use(async (req, res, next) => {
    const url = stripBase(req.url?.split("?")[0] ?? "");
    if (req.method !== "POST" || url !== "/__admin/login") {
      next();
      return;
    }
    try {
      const env = loadEnv(mode, root, "");
      const expectedUser = env.ADMIN_USERNAME ?? "";
      const expectedPassword = env.ADMIN_PASSWORD ?? "";
      if (!expectedUser || !expectedPassword) {
        send(res, 503, { error: "Admin login is not configured." });
        return;
      }
      const body = JSON.parse(await readBody(req)) as { username?: string; password?: string };
      const username = body.username?.trim() ?? "";
      const password = typeof body.password === "string" ? body.password : "";
      if (username !== expectedUser || password !== expectedPassword) {
        send(res, 401, { error: "Those credentials do not match the admin user." });
        return;
      }
      send(res, 200, { ok: true, username });
    } catch {
      send(res, 400, { error: "Could not read the login." });
    }
  });
}

function contactPlugin(): Plugin {
  const attach = (middlewares: Connect.Server) => {
    middlewares.use(async (req, res, next) => {
      const url = stripBase(req.url?.split("?")[0] ?? "");
      if (req.method !== "POST" || url !== "/__contact") {
        next();
        return;
      }
      try {
        const body = JSON.parse(await readBody(req)) as { email?: string; phone?: string; enquiry?: string };
        const email = typeof body.email === "string" ? body.email.trim() : "";
        const phone = typeof body.phone === "string" ? body.phone.trim() : "";
        const enquiry = typeof body.enquiry === "string" ? body.enquiry.trim() : "";
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
        fs.mkdirSync(path.dirname(ENQUIRIES_FILE), { recursive: true });
        fs.writeFileSync(ENQUIRIES_FILE, `${JSON.stringify(current, null, 2)}\n`);
        send(res, 200, { ok: true });
      } catch {
        send(res, 400, { error: "Could not read the enquiry." });
      }
    });
  };
  return {
    name: "contact",
    configureServer(server) {
      attach(server.middlewares);
    },
    configurePreviewServer(server) {
      attach(server.middlewares);
    },
  };
}

function enquiryProblem(email: string, phone: string, enquiry: string): string | null {
  if (!email && !phone) return "Enter an email or a phone number.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "That email does not look right.";
  if (phone && !/^\+?[0-9][0-9\s().-]{6,20}$/.test(phone)) return "That phone number does not look right.";
  if (!enquiry) return "Write a short enquiry.";
  if (enquiry.length > 2000) return "Keep the enquiry under 2000 characters.";
  return null;
}

function readEnquiries(): { id: string; email: string; phone: string; enquiry: string; createdAt: string }[] {
  if (!fs.existsSync(ENQUIRIES_FILE)) return [];
  const parsed = JSON.parse(fs.readFileSync(ENQUIRIES_FILE, "utf8")) as unknown;
  return Array.isArray(parsed) ? parsed : [];
}

function familyFilesPlugin(): Plugin {
  const attach = (middlewares: Connect.Server) => {
    middlewares.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") {
        next();
        return;
      }
      const url = stripBase(req.url?.split("?")[0] ?? "");
      const match = url.match(/^\/families\/([a-z0-9-]+)\.json$/i);
      if (!match) {
        next();
        return;
      }
      const requested = match[1].toLowerCase();
      if (requested !== "index" && !SLUG.test(requested)) {
        next();
        return;
      }
      const file = resolveFamilyJson(`${requested}.json`);
      if (!file) {
        next();
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      fs.createReadStream(file).pipe(res);
    });
    middlewares.use(async (req, res, next) => {
      const url = stripBase(req.url?.split("?")[0] ?? "");
      if (!url.startsWith("/__families/")) {
        next();
        return;
      }
        try {
          if (req.method === "POST" && url === "/__families/save") {
            const family = JSON.parse(await readBody(req)) as {
              slug?: string;
              name?: string;
              people?: unknown[];
              updatedAt?: string;
            };
            if (!family.slug || !SLUG.test(family.slug) || family.slug === "index") {
              send(res, 400, { error: "Family address is not valid." });
              return;
            }
            if (!family.name?.trim() || !Array.isArray(family.people)) {
              send(res, 400, { error: "Family file is incomplete." });
              return;
            }
            fs.mkdirSync(FAMILIES_DIR, { recursive: true });
            const file = path.join(FAMILIES_DIR, `${family.slug}.json`);
            fs.writeFileSync(file, `${JSON.stringify(family, null, 2)}\n`);
            writeIndex();
            send(res, 200, { ok: true, file: `public/families/${family.slug}.json` });
            return;
          }
          if (req.method === "POST" && url === "/__families/delete") {
            const body = JSON.parse(await readBody(req)) as { slug?: string };
            if (!body.slug || !SLUG.test(body.slug) || body.slug === "index") {
              send(res, 400, { error: "Family address is not valid." });
              return;
            }
            const file = path.join(FAMILIES_DIR, `${body.slug}.json`);
            if (fs.existsSync(file)) fs.unlinkSync(file);
            writeIndex();
            send(res, 200, { ok: true });
            return;
          }
          send(res, 404, { error: "Not found" });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Could not write the family file.";
          send(res, 500, { error: message });
        }
      });
  };
  return {
    name: "family-files",
    configureServer(server) {
      attach(server.middlewares);
    },
    configurePreviewServer(server) {
      attach(server.middlewares);
    },
  };
}

function resolveFamilyJson(fileName: string): string | null {
  if (!fs.existsSync(FAMILIES_DIR)) return null;
  const wanted = fileName.toLowerCase();
  const match = fs.readdirSync(FAMILIES_DIR).find((file) => file.toLowerCase() === wanted);
  return match ? path.join(FAMILIES_DIR, match) : null;
}

function writeIndex() {
  const files = fs
    .readdirSync(FAMILIES_DIR)
    .filter((file) => file.endsWith(".json") && file !== "index.json");
  const families = files
    .map((file) => {
      const data = JSON.parse(fs.readFileSync(path.join(FAMILIES_DIR, file), "utf8")) as {
        slug: string;
        name: string;
        people?: unknown[];
      };
      return { slug: data.slug, name: data.name, people: data.people?.length ?? 0 };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(path.join(FAMILIES_DIR, "index.json"), `${JSON.stringify({ families }, null, 2)}\n`);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 8_000_000) {
        reject(new Error("Family file is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}
