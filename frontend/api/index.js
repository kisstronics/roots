import express from "express";
import { attachApi } from "../../backend/src/app.mjs";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(express.json({ limit: "8mb" }));

app.use((req, _res, next) => {
  const queryIndex = req.url.indexOf("?");
  const path = queryIndex === -1 ? req.url : req.url.slice(0, queryIndex);
  if (path.startsWith("/api/") || path.startsWith("/roots/api")) {
    next();
    return;
  }
  const params = new URLSearchParams(queryIndex === -1 ? "" : req.url.slice(queryIndex + 1));
  const route = params.get("route");
  if (!route) {
    next();
    return;
  }
  params.delete("route");
  const query = params.toString();
  req.url = `/api/${route.replace(/^\/+/, "")}${query ? `?${query}` : ""}`;
  next();
});

await attachApi(app);

export default app;
