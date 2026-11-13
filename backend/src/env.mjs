import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(backendRoot, "..");

loadEnvFile(path.join(backendRoot, ".env"));
loadEnvFile(path.join(repoRoot, "frontend", ".env"));

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://our_roots:our_roots@127.0.0.1:5432/our_roots";
}

if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = "dev-only-change-me";
  console.warn("SESSION_SECRET is not set. Using a development secret.");
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
