import "../src/env.mjs";
import { randomUUID } from "node:crypto";
import { sign } from "../src/session.mjs";
import {
  closeDb,
  countOwned,
  createFamily,
  ensureShareToken,
  getByShareToken,
  getCatalog,
  getPool,
  initDb,
  maxFamilies,
} from "../src/db.mjs";

const userId = randomUUID();
const stamp = userId.slice(0, 8);

await initDb();
const pool = getPool();
await pool.query("INSERT INTO users (id, google_sub, email, name) VALUES ($1, $2, $3, $4)", [
  userId,
  `verify-${userId}`,
  `verify-${stamp}@example.com`,
  "Verify",
]);

try {
  const limit = await maxFamilies();
  if (limit !== 10) throw new Error(`Expected the default family limit to be 10, got ${limit}.`);

  const sharma = await getCatalog("sharma");
  if (!sharma) throw new Error("The Sharma tree was not imported from the JSON files.");

  for (let index = 0; index < limit; index += 1) {
    await createFamily(userId, { slug: `verify-${stamp}-${index}`, name: `Verify ${index}` });
  }
  if ((await countOwned(userId)) !== limit) throw new Error("Owned family count did not reach the limit.");

  let blocked = false;
  try {
    await createFamily(userId, { slug: `verify-${stamp}-extra`, name: "Extra" });
  } catch (error) {
    blocked = error.status === 409;
  }
  if (!blocked) throw new Error("Creating a family past the database limit was allowed.");

  const user = { id: userId, email: `verify-${stamp}@example.com` };
  const token = await ensureShareToken(user, `verify-${stamp}-0`);
  const shared = await getByShareToken(token);
  if (!shared || shared.slug !== `verify-${stamp}-0`) throw new Error("The public share token did not load the family.");
  const again = await ensureShareToken(user, `verify-${stamp}-0`);
  if (again !== token) throw new Error("Generating the link a second time changed it.");

  const session = sign({ uid: userId, exp: Date.now() + 60_000 });
  if (!session.includes(".")) throw new Error("Session cookie was not signed.");

  console.log("Database checks passed.");
} finally {
  await pool.query("DELETE FROM users WHERE id = $1", [userId]);
  await closeDb();
}
