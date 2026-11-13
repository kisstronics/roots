import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import "./env.mjs";
import { isSiteAdmin } from "./admin.mjs";
import { HttpError } from "./http.mjs";
import { isSafeSlug } from "./slug.mjs";

const familiesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../frontend/public/families");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  google_sub TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  picture TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO app_settings (key, value)
VALUES ('max_families_per_user', '10')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS families (
  id UUID PRIMARY KEY,
  owner_id UUID REFERENCES users (id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  people JSONB NOT NULL DEFAULT '[]'::jsonb,
  share_token TEXT UNIQUE,
  is_catalog BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS families_owner_slug_idx
  ON families (owner_id, slug)
  WHERE owner_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS families_catalog_slug_idx
  ON families (slug)
  WHERE is_catalog;
`;

let pool;

function poolConfig(connectionString) {
  const config = {
    connectionString,
    connectionTimeoutMillis: 5000,
  };
  // Hosted Postgres (Render and similar) refuses non-TLS connections.
  // Local Postgres usually has TLS disabled, so leave those connections plain.
  if (remoteDatabase(connectionString) && !connectionChoosesSsl(connectionString)) {
    config.ssl = { rejectUnauthorized: false };
  }
  return config;
}

function remoteDatabase(connectionString) {
  try {
    const host = new URL(connectionString).hostname;
    return host !== "localhost" && host !== "127.0.0.1" && host !== "::1";
  } catch {
    return false;
  }
}

function connectionChoosesSsl(connectionString) {
  try {
    const params = new URL(connectionString).searchParams;
    return params.has("sslmode") || params.has("ssl");
  } catch {
    return false;
  }
}

export function getPool() {
  if (!pool) {
    pool = new pg.Pool(poolConfig(process.env.DATABASE_URL));
    pool.on("error", (error) => {
      console.error("PostgreSQL client error:", error.message);
    });
  }
  return pool;
}

export async function initDb() {
  const db = getPool();
  await db.query("SELECT 1");
  await db.query("CREATE EXTENSION IF NOT EXISTS pgcrypto").catch(() => undefined);
  await db.query(SCHEMA);
  await seedCatalog();
}

export async function closeDb() {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}

export async function maxFamilies(client = getPool()) {
  const { rows } = await client.query("SELECT value FROM app_settings WHERE key = 'max_families_per_user'");
  const parsed = Number(rows[0]?.value);
  if (!Number.isInteger(parsed) || parsed < 0) return 10;
  return parsed;
}

export async function countOwned(userId, client = getPool()) {
  const { rows } = await client.query(
    "SELECT count(*)::int AS count FROM families WHERE owner_id = $1 AND is_catalog = false",
    [userId],
  );
  return rows[0]?.count ?? 0;
}

export async function findUserById(id) {
  const { rows } = await getPool().query("SELECT * FROM users WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function upsertGoogleUser({ sub, email, name, picture }) {
  const inserted = await getPool().query(
    `INSERT INTO users (id, google_sub, email, name, picture)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (google_sub) DO NOTHING
     RETURNING *`,
    [randomUUID(), sub, email, name, picture],
  );
  if (inserted.rowCount) return { user: inserted.rows[0], created: true };
  const updated = await getPool().query(
    `UPDATE users
     SET email = $2, name = $3, picture = $4
     WHERE google_sub = $1
     RETURNING *`,
    [sub, email, name, picture],
  );
  return { user: updated.rows[0], created: false };
}

export async function listForUser(user) {
  const admin = isSiteAdmin(user);
  const { rows } = await getPool().query(
    `SELECT * FROM families
     WHERE owner_id = $1 OR ($2 = true AND is_catalog)
     ORDER BY name ASC, slug ASC`,
    [user.id, admin],
  );
  return rows;
}

export async function getEditable(user, slug) {
  const admin = isSiteAdmin(user);
  const { rows } = await getPool().query(
    `SELECT * FROM families
     WHERE slug = $1 AND (owner_id = $2 OR ($3 = true AND is_catalog))
     ORDER BY is_catalog ASC
     LIMIT 1`,
    [slug, user.id, admin],
  );
  return rows[0] ?? null;
}

export async function createFamily(userId, { slug, name }) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1::text))", [userId]);
    const limit = await maxFamilies(client);
    const owned = await countOwned(userId, client);
    if (owned >= limit) {
      throw new HttpError(409, `You can create up to ${limit} ${limit === 1 ? "family" : "families"}.`);
    }
    const catalog = await client.query("SELECT 1 FROM families WHERE is_catalog AND slug = $1", [slug]);
    if (catalog.rowCount) {
      throw new HttpError(409, "A public family already uses that address.");
    }
    try {
      await client.query(
        `INSERT INTO families (id, owner_id, slug, name, people, is_catalog)
         VALUES ($1, $2, $3, $4, '[]'::jsonb, false)`,
        [randomUUID(), userId, slug, name],
      );
    } catch (error) {
      if (error.code === "23505") throw new HttpError(409, "A family with that address already exists.");
      throw error;
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  const { rows } = await getPool().query(
    "SELECT * FROM families WHERE owner_id = $1 AND slug = $2 AND is_catalog = false",
    [userId, slug],
  );
  return rows[0];
}

export async function updateFamily(user, slug, { name, people }) {
  const existing = await getEditable(user, slug);
  if (!existing) throw new HttpError(404, "That family was not found.");
  const { rows } = await getPool().query(
    `UPDATE families
     SET name = $1, people = $2::jsonb, updated_at = now()
     WHERE id = $3
     RETURNING *`,
    [name, JSON.stringify(people), existing.id],
  );
  return rows[0];
}

export async function deleteFamily(user, slug) {
  const existing = await getEditable(user, slug);
  if (!existing) throw new HttpError(404, "That family was not found.");
  await getPool().query("DELETE FROM families WHERE id = $1", [existing.id]);
}

export async function ensureShareToken(user, slug) {
  const existing = await getEditable(user, slug);
  if (!existing) throw new HttpError(404, "That family was not found.");
  if (existing.share_token) return existing.share_token;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = randomToken();
    try {
      const { rows, rowCount } = await getPool().query(
        `UPDATE families
         SET share_token = $1
         WHERE id = $2 AND share_token IS NULL
         RETURNING share_token`,
        [token, existing.id],
      );
      if (rowCount) return rows[0].share_token;
      const current = await getEditable(user, slug);
      if (current?.share_token) return current.share_token;
    } catch (error) {
      if (error.code !== "23505") throw error;
    }
  }
  throw new HttpError(500, "Could not generate a link.");
}

export async function getByShareToken(token) {
  const { rows } = await getPool().query("SELECT * FROM families WHERE share_token = $1", [token]);
  return rows[0] ?? null;
}

export async function listCatalog() {
  const { rows } = await getPool().query("SELECT * FROM families WHERE is_catalog ORDER BY name ASC, slug ASC");
  return rows;
}

export async function getCatalog(slug) {
  const { rows } = await getPool().query("SELECT * FROM families WHERE is_catalog AND slug = $1", [slug]);
  return rows[0] ?? null;
}

export function asPeople(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function countGenerations(people) {
  if (!people.length) return 0;
  const byId = new Map(people.map((person) => [person.id, person]));
  const memo = new Map();

  function depth(id, stack) {
    const cached = memo.get(id);
    if (cached) return cached;
    if (stack.has(id)) return 1;
    const person = byId.get(id);
    const parentIds = Array.isArray(person?.parentIds) ? person.parentIds : [];
    if (!person || parentIds.length === 0) {
      memo.set(id, 1);
      return 1;
    }
    stack.add(id);
    const value = 1 + Math.max(...parentIds.map((parentId) => depth(parentId, stack)));
    stack.delete(id);
    memo.set(id, value);
    return value;
  }

  return Math.max(...people.map((person) => depth(person.id, new Set())));
}

export function summarize(row) {
  const people = asPeople(row.people);
  return {
    slug: row.slug,
    name: row.name,
    people: people.length,
    generations: countGenerations(people),
    shareToken: row.share_token,
    publicTree: row.is_catalog,
  };
}

export function mapFamily(row) {
  return {
    slug: row.slug,
    name: row.name,
    people: asPeople(row.people),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function cleanPeople(value) {
  if (!Array.isArray(value)) throw new HttpError(400, "Family file is incomplete.");
  if (value.length > 5000) throw new HttpError(400, "This family has too many people.");
  const people = value.filter((person) => person && typeof person === "object" && typeof person.id === "string" && person.id);
  const encoded = JSON.stringify(people);
  if (encoded.length > 7_000_000) throw new HttpError(400, "That family is too large to save.");
  return people;
}

export function cleanName(value) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) throw new HttpError(400, "Enter a family name.");
  if (name.length > 80) throw new HttpError(400, "Use a shorter family name.");
  return name;
}

async function seedCatalog() {
  const { rows } = await getPool().query("SELECT count(*)::int AS count FROM families WHERE is_catalog");
  if ((rows[0]?.count ?? 0) > 0) return;
  if (!fs.existsSync(familiesDir)) return;
  const files = fs.readdirSync(familiesDir).filter((file) => file.endsWith(".json") && file.toLowerCase() !== "index.json");
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(familiesDir, file), "utf8"));
      const slug = isSafeSlug(data.slug) ? data.slug : null;
      const name = typeof data.name === "string" ? data.name.trim() : "";
      if (!slug || !name) continue;
      const people = Array.isArray(data.people) ? data.people : [];
      const parsedTime = Date.parse(data.updatedAt || "");
      const updated = Number.isNaN(parsedTime) ? new Date() : new Date(parsedTime);
      const existing = await getPool().query("SELECT 1 FROM families WHERE is_catalog AND slug = $1", [slug]);
      if (existing.rowCount) continue;
      await getPool().query(
        `INSERT INTO families (id, slug, name, people, is_catalog, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, true, $5)`,
        [randomUUID(), slug, name.slice(0, 80), JSON.stringify(people), updated],
      );
    } catch (error) {
      console.error(`Could not import ${file}:`, error.message);
    }
  }
}

function randomToken() {
  return randomBytes(24).toString("base64url");
}
