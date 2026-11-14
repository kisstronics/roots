import express from "express";
import { attachApi } from "./app.mjs";
import { send } from "./http.mjs";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(express.json({ limit: "8mb" }));

await attachApi(app);

app.use((error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error?.type === "entity.too.large") {
    send(res, 400, { error: "That family is too large to save." });
    return;
  }
  if (error instanceof SyntaxError && "body" in error) {
    send(res, 400, { error: "Could not read the request." });
    return;
  }
  console.error(error);
  send(res, 500, { error: "The server could not finish that request." });
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, "0.0.0.0", () => {
  console.log(`Our Roots API is listening at http://127.0.0.1:${port}/api/health`);
});
