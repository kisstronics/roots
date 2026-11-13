import express from "express";
import { attachApi } from "../../backend/src/app.mjs";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(express.json({ limit: "8mb" }));

app.use((req, _res, next) => {
  const path = req.url.split("?")[0];
  if (path === "/api" || path.startsWith("/api/") || path === "/roots/api" || path.startsWith("/roots/api/")) {
    next();
    return;
  }
  const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const suffix = path.startsWith("/") ? path : `/${path}`;
  req.url = `/api${suffix}${query}`;
  next();
});

await attachApi(app);

export default app;
