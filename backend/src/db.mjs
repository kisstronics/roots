import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import "./env.mjs";
import { isSiteAdmin } from "./admin.mjs";
import { loadAppSettings } from "./settings.mjs";
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

CREATE TABLE IF NOT EXISTS people (
  family_id UUID NOT NULL REFERENCES families (id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT 'male',
  living BOOLEAN NOT NULL DEFAULT true,
  birth_year INTEGER,
  death_year INTEGER,
  birthday TEXT,
  deathday TEXT,
  birth_location TEXT NOT NULL DEFAULT '',
  current_location TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  photo TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id, id)
);

CREATE TABLE IF NOT EXISTS family_members (
  family_id UUID NOT NULL REFERENCES families (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id, user_id)
);

CREATE TABLE IF NOT EXISTS share_links (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families (id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS share_links_owner_idx ON share_links (created_by, family_id);

CREATE TABLE IF NOT EXISTS family_edits (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families (id) ON DELETE CASCADE,
  user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  user_name TEXT NOT NULL DEFAULT '',
  user_email TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS family_edits_family_idx ON family_edits (family_id, created_at DESC);

CREATE TABLE IF NOT EXISTS family_invites (
  family_id UUID NOT NULL REFERENCES families (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id, email)
);
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
  await db.query(`
    ALTER TABLE families ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    ALTER TABLE family_members ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users (id) ON DELETE SET NULL;
    ALTER TABLE family_members ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users (id) ON DELETE SET NULL;
    ALTER TABLE family_members ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE family_invites ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users (id) ON DELETE SET NULL;
    ALTER TABLE family_invites ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users (id) ON DELETE SET NULL;
    ALTER TABLE family_invites ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    CREATE TABLE IF NOT EXISTS access_events (
      id UUID PRIMARY KEY,
      family_id UUID NOT NULL REFERENCES families (id) ON DELETE CASCADE,
      actor_id UUID REFERENCES users (id) ON DELETE SET NULL,
      actor_name TEXT NOT NULL DEFAULT '',
      actor_email TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      target_email TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS access_events_family_idx ON access_events (family_id, created_at DESC);
    DROP INDEX IF EXISTS families_owner_slug_idx;
    CREATE UNIQUE INDEX IF NOT EXISTS families_owner_slug_active_idx
      ON families (owner_id, slug)
      WHERE owner_id IS NOT NULL AND deleted_at IS NULL;
    ALTER TABLE families ADD COLUMN IF NOT EXISTS structure JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE families ADD COLUMN IF NOT EXISTS structure_updated_at TIMESTAMPTZ;
    UPDATE families SET structure_updated_at = updated_at WHERE structure_updated_at IS NULL;
    ALTER TABLE families ALTER COLUMN structure_updated_at SET DEFAULT now();
    ALTER TABLE families ALTER COLUMN structure_updated_at SET NOT NULL;
  `);
  await migratePeopleOutOfFamilies();
  await seedCatalog();
  await loadAppSettings(db);
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
    "SELECT count(*)::int AS count FROM families WHERE owner_id = $1 AND is_catalog = false AND deleted_at IS NULL",
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
    `SELECT f.*,
       CASE
         WHEN f.owner_id = $1 THEN 'owner'
         WHEN m.role IS NOT NULL THEN m.role
         WHEN $2 = true THEN 'viewer'
         ELSE m.role
       END AS access_role
     FROM families f
     LEFT JOIN family_members m ON m.family_id = f.id AND m.user_id = $1
     WHERE f.deleted_at IS NULL
       AND (
         f.owner_id = $1
         OR m.user_id IS NOT NULL
         OR ($2 = true AND f.is_catalog = false)
       )
     ORDER BY f.name ASC, f.slug ASC`,
    [user.id, admin],
  );
  return rows;
}

export async function getReadable(user, slug) {
  const admin = isSiteAdmin(user);
  const { rows } = await getPool().query(
    `SELECT f.*,
       CASE
         WHEN f.owner_id = $2 THEN 'owner'
         WHEN m.role IS NOT NULL THEN m.role
         WHEN $3 = true THEN 'viewer'
         ELSE m.role
       END AS access_role
     FROM families f
     LEFT JOIN family_members m ON m.family_id = f.id AND m.user_id = $2
     WHERE f.slug = $1
       AND f.deleted_at IS NULL
       AND (
         f.owner_id = $2
         OR m.user_id IS NOT NULL
         OR ($3 = true AND f.is_catalog = false)
       )
     ORDER BY (f.owner_id = $2) DESC
     LIMIT 1`,
    [slug, user.id, admin],
  );
  return rows[0] ?? null;
}

export async function getEditable(user, slug) {
  const row = await getReadable(user, slug);
  if (!row || row.access_role === "viewer") return null;
  return row;
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

export async function updatePerson(user, slug, personId, profile) {
  const existing = await getEditable(user, slug);
  if (!existing) throw new HttpError(404, "That family was not found.");
  const id = cleanPersonId(personId);
  const current = await getPool().query("SELECT * FROM people WHERE family_id = $1 AND id = $2", [existing.id, id]);
  if (!current.rowCount) throw new HttpError(404, "That person is no longer in this family.");
  if (sameProfile(current.rows[0], profile)) return { changed: false };
  await getPool().query(
    `UPDATE people
     SET first_name = $3,
         last_name = $4,
         gender = $5,
         living = $6,
         birth_year = $7,
         death_year = $8,
         birthday = $9,
         deathday = $10,
         birth_location = $11,
         current_location = $12,
         notes = $13,
         photo = $14,
         updated_at = now()
     WHERE family_id = $1 AND id = $2`,
    [
      existing.id,
      id,
      profile.firstName,
      profile.lastName,
      profile.gender,
      profile.living,
      profile.birthYear,
      profile.deathYear,
      profile.birthday,
      profile.deathday,
      profile.birthLocation,
      profile.currentLocation,
      profile.notes,
      profile.photo,
    ],
  );
  return { changed: true };
}

const STRUCTURE_CONFLICT = "Someone else updated this tree. Your change was not saved, and the latest tree is shown.";

export async function updateStructure(user, slug, { name, structure, people, baseUpdatedAt }) {
  const existing = await getEditable(user, slug);
  if (!existing) throw new HttpError(404, "That family was not found.");
  if (!Number.isFinite(new Date(baseUpdatedAt).getTime())) {
    throw new HttpError(400, "Reload this tree before changing its structure.");
  }
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query(
      `SELECT * FROM families WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [existing.id],
    );
    if (!locked.rowCount) throw new HttpError(404, "That family was not found.");
    const current = locked.rows[0];
    if (!sameMillis(current.structure_updated_at, baseUpdatedAt)) {
      const family = await mapFamily(current, client);
      throw new HttpError(409, STRUCTURE_CONFLICT, { family });
    }
    const stored = cleanStructure(asStructure(current.structure).length ? current.structure : linksFromPeople(asPeople(current.people)));
    const next = cleanStructure(structure);
    if (current.name === name && JSON.stringify(stored) === JSON.stringify(next)) {
      await client.query("COMMIT");
      return { row: current, changed: false };
    }
    const profiles = new Map(people.map((person) => [person.id, person]));
    for (const link of next) {
      const profile = profiles.get(link.id) || emptyProfile();
      await insertPerson(client, existing.id, link.id, profile);
    }
    await client.query("DELETE FROM people WHERE family_id = $1 AND id <> ALL($2::text[])", [
      existing.id,
      next.map((link) => link.id),
    ]);
    const saved = await client.query(
      `UPDATE families
       SET name = $1,
           structure = $2::jsonb,
           people = '[]'::jsonb,
           structure_updated_at = now(),
           updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [name, JSON.stringify(next), existing.id],
    );
    if (!saved.rowCount) throw new HttpError(404, "That family was not found.");
    await client.query("COMMIT");
    return { row: saved.rows[0], changed: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteFamily(user, slug) {
  const existing = await getReadable(user, slug);
  if (!existing) throw new HttpError(404, "That family was not found.");
  if (existing.access_role !== "owner") throw new HttpError(403, "Only the owner can delete this family.");
  await getPool().query("UPDATE families SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL", [
    existing.id,
  ]);
}

export async function ensureViewToken(user, slug) {
  const existing = await getReadable(user, slug);
  if (!existing) throw new HttpError(404, "That family was not found.");
  if (existing.share_token) return { token: existing.share_token, created: false };
  const token = randomToken();
  const saved = await getPool().query(
    `UPDATE families
     SET share_token = $1
     WHERE id = $2 AND share_token IS NULL AND deleted_at IS NULL
     RETURNING share_token`,
    [token, existing.id],
  );
  if (saved.rowCount) return { token: saved.rows[0].share_token, created: true };
  const again = await getPool().query("SELECT share_token FROM families WHERE id = $1", [existing.id]);
  if (!again.rows[0]?.share_token) throw new HttpError(500, "The view link could not be created.");
  return { token: again.rows[0].share_token, created: false };
}

export async function ensureShareToken(user, slug) {
  const existing = await getReadable(user, slug);
  if (!existing) throw new HttpError(404, "That family was not found.");
  const current = await getPool().query(
    `SELECT token FROM share_links
     WHERE family_id = $1 AND created_by = $2 AND expires_at IS NULL
     ORDER BY created_at ASC
     LIMIT 1`,
    [existing.id, user.id],
  );
  if (current.rowCount) return current.rows[0].token;
  const token = randomToken();
  await getPool().query(
    `INSERT INTO share_links (id, family_id, created_by, token, expires_at)
     VALUES ($1, $2, $3, $4, NULL)`,
    [randomUUID(), existing.id, user.id, token],
  );
  return token;
}

export async function lookupShare(token) {
  const linked = await getPool().query(
    `SELECT f.*, s.expires_at
     FROM share_links s
     JOIN families f ON f.id = s.family_id
     WHERE s.token = $1 AND f.deleted_at IS NULL`,
    [token],
  );
  if (linked.rowCount) {
    const row = linked.rows[0];
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return { expired: true };
    return { row };
  }
  const legacy = await getPool().query("SELECT * FROM families WHERE share_token = $1 AND deleted_at IS NULL", [token]);
  if (legacy.rowCount) return { row: legacy.rows[0] };
  return null;
}

export async function getByShareToken(token) {
  const found = await lookupShare(token);
  if (!found || found.expired) return null;
  return found.row;
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
  const people = summaryPeople(row);
  return {
    slug: row.slug,
    name: row.name,
    people: people.length,
    generations: countGenerations(people),
    shareToken: row.share_token,
    publicTree: row.is_catalog,
    role: row.access_role || "owner",
  };
}

export async function mapFamily(row, client = getPool()) {
  return {
    slug: row.slug,
    name: row.name,
    people: await mergedPeople(client, row),
    updatedAt: new Date(row.structure_updated_at || row.updated_at).toISOString(),
  };
}

export function cleanPeople(value) {
  if (!value) return [];
  if (!Array.isArray(value)) throw new HttpError(400, "Family file is incomplete.");
  return value.map((person) => ({
    id: cleanPersonId(person?.id),
    ...cleanPerson(person),
  }));
}

export function cleanName(value) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) throw new HttpError(400, "Enter a family name.");
  if (name.length > 80) throw new HttpError(400, "Use a shorter family name.");
  return name;
}

export function cleanPerson(value) {
  const profile = profileFromPerson(value);
  if (!profile.firstName) throw new HttpError(400, "Enter a first name.");
  if (!profile.lastName) throw new HttpError(400, "Enter a last name.");
  if (profile.photo && profile.photo.length > 2_000_000) throw new HttpError(400, "That photo is too large to save.");
  return profile;
}

export function cleanPersonId(value) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new HttpError(400, "That person could not be saved.");
  return id;
}

export function cleanStructure(value) {
  if (!Array.isArray(value)) throw new HttpError(400, "The tree structure is incomplete.");
  if (value.length > 5000) throw new HttpError(400, "This family has too many people.");
  const links = [];
  const seen = new Set();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    let id = "";
    try {
      id = cleanPersonId(item.id);
    } catch {
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    links.push({
      id,
      parentIds: idList(item.parentIds),
      spouseIds: idList(item.spouseIds),
      siblingIds: idList(item.siblingIds),
    });
  }
  for (const link of links) {
    link.parentIds = link.parentIds.filter((parentId) => seen.has(parentId) && parentId !== link.id);
    link.spouseIds = link.spouseIds.filter((spouseId) => seen.has(spouseId) && spouseId !== link.id);
    link.siblingIds = link.siblingIds.filter((siblingId) => seen.has(siblingId) && siblingId !== link.id);
  }
  const byId = new Map(links.map((link) => [link.id, link]));
  for (const link of links) {
    for (const spouseId of link.spouseIds) {
      const spouse = byId.get(spouseId);
      if (spouse && !spouse.spouseIds.includes(link.id)) spouse.spouseIds.push(link.id);
    }
    for (const siblingId of link.siblingIds) {
      const sibling = byId.get(siblingId);
      if (sibling && !sibling.siblingIds.includes(link.id)) sibling.siblingIds.push(link.id);
    }
  }
  return links;
}

export function linksFromPeople(people) {
  return people
    .filter((person) => person && person.id)
    .map((person) => ({
      id: String(person.id),
      parentIds: idList(person.parentIds),
      spouseIds: idList(person.spouseIds),
      siblingIds: idList(person.siblingIds),
    }));
}

export function sameMillis(left, right) {
  const a = new Date(left).getTime();
  const b = new Date(right).getTime();
  return Number.isFinite(a) && a === b;
}

export function profileFromPerson(person) {
  const source = person && typeof person === "object" ? person : {};
  const birthday = toDate(source.birthday);
  const deathday = toDate(source.deathday);
  const recordedDeath = yearFromDate(deathday) ?? toYear(source.deathYear);
  const living = typeof source.living === "boolean" ? source.living : recordedDeath === null && deathday === null;
  return {
    firstName: toText(source.firstName, 80),
    lastName: toText(source.lastName, 80),
    gender: source.gender === "female" ? "female" : "male",
    living,
    birthYear: yearFromDate(birthday) ?? toYear(source.birthYear),
    deathYear: living ? null : recordedDeath,
    birthday,
    deathday: living ? null : deathday,
    birthLocation: toText(source.birthLocation, 120),
    currentLocation: toText(source.currentLocation, 120),
    notes: toText(source.notes, 500),
    photo: toPhoto(source.photo),
  };
}

function summaryPeople(row) {
  const links = asStructure(row.structure);
  if (links.length) return links;
  return asPeople(row.people);
}

async function mergedPeople(client, row) {
  const links = asStructure(row.structure);
  const source = links.length ? links : linksFromPeople(asPeople(row.people));
  if (!source.length) return [];
  const { rows } = await client.query("SELECT * FROM people WHERE family_id = $1", [row.id]);
  if (!rows.length && !links.length) return asPeople(row.people);
  const byId = new Map(rows.map((person) => [person.id, person]));
  return source.map((link) => personFromRow(byId.get(link.id), link));
}

function personFromRow(row, link) {
  const profile = row ? profileFromRow(row) : emptyProfile();
  return {
    id: link.id,
    ...profile,
    parentIds: idList(link.parentIds),
    spouseIds: idList(link.spouseIds),
    siblingIds: idList(link.siblingIds),
  };
}

function profileFromRow(row) {
  return {
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    gender: row.gender === "female" ? "female" : "male",
    living: Boolean(row.living),
    birthYear: toYear(row.birth_year),
    deathYear: row.living ? null : toYear(row.death_year),
    birthday: toDate(row.birthday),
    deathday: row.living ? null : toDate(row.deathday),
    birthLocation: row.birth_location || "",
    currentLocation: row.current_location || "",
    notes: row.notes || "",
    photo: toPhoto(row.photo),
  };
}

function emptyProfile() {
  return profileFromPerson({});
}

function sameProfile(row, profile) {
  const current = profileFromRow(row);
  return (
    current.firstName === profile.firstName &&
    current.lastName === profile.lastName &&
    current.gender === profile.gender &&
    current.living === profile.living &&
    current.birthYear === profile.birthYear &&
    current.deathYear === profile.deathYear &&
    current.birthday === profile.birthday &&
    current.deathday === profile.deathday &&
    current.birthLocation === profile.birthLocation &&
    current.currentLocation === profile.currentLocation &&
    current.notes === profile.notes &&
    current.photo === profile.photo
  );
}

async function insertPerson(client, familyId, personId, profile) {
  const id = String(personId).trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return;
  await client.query(
    `INSERT INTO people (
       family_id, id, first_name, last_name, gender, living,
       birth_year, death_year, birthday, deathday,
       birth_location, current_location, notes, photo
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (family_id, id) DO NOTHING`,
    [
      familyId,
      id,
      profile.firstName,
      profile.lastName,
      profile.gender,
      profile.living,
      profile.birthYear,
      profile.deathYear,
      profile.birthday,
      profile.deathday,
      profile.birthLocation,
      profile.currentLocation,
      profile.notes,
      profile.photo,
    ],
  );
}

function asStructure(value) {
  const list = asPeople(value);
  return list
    .filter((item) => item && typeof item.id === "string" && item.id)
    .map((item) => ({
      id: item.id,
      parentIds: idList(item.parentIds),
      spouseIds: idList(item.spouseIds),
      siblingIds: idList(item.siblingIds),
    }));
}

function idList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const ids = [];
  for (const item of value) {
    const id = typeof item === "string" ? item.trim() : "";
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function toPhoto(value) {
  if (typeof value !== "string") return null;
  const photo = value.trim();
  if (!photo.startsWith("data:image/")) return null;
  return photo;
}

function toYear(value) {
  if (value === null || value === undefined || value === "") return null;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1 || year > 9999) return null;
  return year;
}

function yearFromDate(value) {
  if (!value) return null;
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(value);
  return match ? Number(match[1]) : null;
}

function toDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

function toText(value, max) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

async function migratePeopleOutOfFamilies() {
  const { rows } = await getPool().query(
    `SELECT id, people, structure, updated_at
     FROM families
     WHERE jsonb_typeof(people) = 'array' AND jsonb_array_length(people) > 0`,
  );
  for (const row of rows) {
    const people = asPeople(row.people);
    if (!people.some((person) => person && (person.firstName || person.lastName || person.parentIds || person.spouseIds))) {
      continue;
    }
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const count = await client.query("SELECT count(*)::int AS count FROM people WHERE family_id = $1", [row.id]);
      if ((count.rows[0]?.count ?? 0) === 0) {
        for (const person of people) {
          if (!person?.id) continue;
          await insertPerson(client, row.id, person.id, profileFromPerson(person));
        }
      }
      const structure = asStructure(row.structure);
      if (!structure.length) {
        await client.query(
          `UPDATE families
           SET structure = $2::jsonb,
               structure_updated_at = COALESCE(structure_updated_at, $3),
               people = '[]'::jsonb
           WHERE id = $1`,
          [row.id, JSON.stringify(linksFromPeople(people)), row.updated_at],
        );
      } else {
        await client.query("UPDATE families SET people = '[]'::jsonb WHERE id = $1", [row.id]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.error("Could not move people out of the family record:", error.message);
    } finally {
      client.release();
    }
  }
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
      const familyId = randomUUID();
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO families (id, slug, name, people, structure, is_catalog, updated_at, structure_updated_at)
           VALUES ($1, $2, $3, '[]'::jsonb, $4::jsonb, true, $5, $5)`,
          [familyId, slug, name.slice(0, 80), JSON.stringify(linksFromPeople(people)), updated],
        );
        for (const person of people) {
          if (!person?.id) continue;
          await insertPerson(client, familyId, String(person.id), profileFromPerson(person));
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(`Could not import ${file}:`, error.message);
    }
  }
}

function randomToken() {
  return randomBytes(24).toString("base64url");
}
