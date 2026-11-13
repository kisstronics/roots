import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backend = path.resolve(frontend, "../backend");
const viteBin = path.join(frontend, "node_modules", "vite", "bin", "vite.js");

const apiEnv = {
  ...process.env,
  APP_PUBLIC_URL: process.env.APP_PUBLIC_URL || "http://localhost:5173/roots",
  GOOGLE_CALLBACK_URL:
    process.env.GOOGLE_CALLBACK_URL || "http://localhost:5173/roots/api/auth/google/callback",
  PORT: process.env.API_PORT || "3001",
};

const api = spawn(process.execPath, ["--watch", "src/index.mjs"], {
  cwd: backend,
  stdio: "inherit",
  env: apiEnv,
});

const web = spawn(process.execPath, [viteBin], {
  cwd: frontend,
  stdio: "inherit",
});

function stop() {
  if (!api.killed) api.kill();
  if (!web.killed) web.kill();
}

process.on("SIGINT", () => {
  stop();
  process.exit(0);
});
process.on("SIGTERM", stop);
process.on("exit", stop);

api.on("exit", (code) => {
  if (code) {
    stop();
    process.exit(code);
  }
});

web.on("exit", (code) => {
  stop();
  process.exit(code ?? 0);
});
