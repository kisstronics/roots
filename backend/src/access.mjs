import { randomBytes, randomUUID } from "node:crypto";
import { HttpError } from "./http.mjs";
import { asPeople, getPool } from "./db.mjs";

const DAY = 24 * 60 * 60 * 1000;
const EDIT_WINDOW = 2 * 60 * 1000;

export function expiryDate(choice, now = Date.now()) {
  if (choice === "30") return new Date(now + 30 * DAY);
  if (choice === "60") return new Date(now + 60 * DAY);
  if (choice === "never") return null;
  throw new HttpError(400, "Choose 30 days, 60 days, or never.");
}

export async function listMembers(familyId) {
  const [members, invites] = await Promise.all([
    getPool().query(
      `SELECT u.id, u.email, u.name, m.role,
              c.name AS created_name, c.email AS created_email, m.created_at,
              up.name AS updated_name, up.email AS updated_email, m.updated_at
       FROM family_members m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN users c ON c.id = m.created_by
       LEFT JOIN users up ON up.id = m.updated_by
       WHERE m.family_id = $1
       ORDER BY u.name ASC, u.email ASC`,
      [familyId],
    ),
    getPool().query(
      `SELECT i.email, i.role, i.created_at, i.updated_at,
              c.name AS created_name, c.email AS created_email,
              up.name AS updated_name, up.email AS updated_email
       FROM family_invites i
       LEFT JOIN users c ON c.id = i.created_by
       LEFT JOIN users up ON up.id = i.updated_by
       WHERE i.family_id = $1
       ORDER BY i.email ASC`,
      [familyId],
    ),
  ]);
  return [
    ...members.rows.map((row) => memberRecord(row, false)),
    ...invites.rows.map((row) => memberRecord({ ...row, id: row.email, name: "" }, true)),
  ];
}

export async function grantMember(actor, family, email, role) {
  if (family.access_role !== "owner") throw new HttpError(403, "Only the owner can share this family.");
  if (role !== "editor" && role !== "viewer") throw new HttpError(400, "Choose editor or viewer.");
  const address = String(email || "").trim().toLowerCase();
  if (!address) throw new HttpError(400, "Enter the person's email.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new HttpError(400, "That email does not look right.");
  const found = await getPool().query("SELECT * FROM users WHERE lower(email) = $1", [address]);
  const person = found.rows[0];
  if (person?.id === family.owner_id) throw new HttpError(409, "That person already owns this family.");
  if (!person) {
    const prior = await getPool().query("SELECT role FROM family_invites WHERE family_id = $1 AND email = $2", [
      family.id,
      address,
    ]);
    await getPool().query(
      `INSERT INTO family_invites (family_id, email, role, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $4)
       ON CONFLICT (family_id, email) DO UPDATE
       SET role = EXCLUDED.role, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [family.id, address, role, actor?.id ?? null],
    );
    const action = prior.rowCount && prior.rows[0].role !== role ? "role_changed" : prior.rowCount ? "" : "invited";
    if (action) await recordAccess(actor, family.id, action, { email: address, role });
    return { userId: address, email: address, name: "", role, pending: true };
  }
  const prior = await getPool().query("SELECT role FROM family_members WHERE family_id = $1 AND user_id = $2", [
    family.id,
    person.id,
  ]);
  await getPool().query(
    `INSERT INTO family_members (family_id, user_id, role, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $4)
     ON CONFLICT (family_id, user_id) DO UPDATE
     SET role = EXCLUDED.role, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [family.id, person.id, role, actor?.id ?? null],
  );
  await getPool().query("DELETE FROM family_invites WHERE family_id = $1 AND email = $2", [family.id, address]);
  const action = prior.rowCount && prior.rows[0].role !== role ? "role_changed" : prior.rowCount ? "" : "shared";
  if (action) await recordAccess(actor, family.id, action, { email: person.email, role });
  return { userId: person.id, email: person.email, name: person.name, role, pending: false };
}

export async function changeMember(actor, family, userId, role) {
  if (family.access_role !== "owner") throw new HttpError(403, "Only the owner can change access.");
  if (role !== "editor" && role !== "viewer") throw new HttpError(400, "Choose editor or viewer.");
  const key = decodeURIComponent(String(userId || ""));
  if (key.includes("@")) {
    const address = key.toLowerCase();
    const { rowCount } = await getPool().query(
      "UPDATE family_invites SET role = $1, updated_by = $4, updated_at = now() WHERE family_id = $2 AND email = $3",
      [role, family.id, address, actor?.id ?? null],
    );
    if (!rowCount) throw new HttpError(404, "That person is not on this family.");
    await recordAccess(actor, family.id, "role_changed", { email: address, role });
    return;
  }
  const person = await getPool().query("SELECT email FROM users WHERE id = $1", [key]);
  const { rowCount } = await getPool().query(
    "UPDATE family_members SET role = $1, updated_by = $4, updated_at = now() WHERE family_id = $2 AND user_id = $3",
    [role, family.id, key, actor?.id ?? null],
  );
  if (!rowCount) throw new HttpError(404, "That person is not on this family.");
  await recordAccess(actor, family.id, "role_changed", { email: person.rows[0]?.email || "", role });
}

export async function removeMember(actor, family, userId) {
  if (family.access_role !== "owner") throw new HttpError(403, "Only the owner can remove access.");
  const key = decodeURIComponent(String(userId || ""));
  let email = key.toLowerCase();
  let rowCount = 0;
  if (key.includes("@")) {
    const removed = await getPool().query("DELETE FROM family_invites WHERE family_id = $1 AND email = $2", [
      family.id,
      email,
    ]);
    rowCount = removed.rowCount;
  } else {
    const person = await getPool().query("SELECT email FROM users WHERE id = $1", [key]);
    email = person.rows[0]?.email || "";
    const removed = await getPool().query("DELETE FROM family_members WHERE family_id = $1 AND user_id = $2", [
      family.id,
      key,
    ]);
    rowCount = removed.rowCount;
  }
  if (!rowCount) throw new HttpError(404, "That person is not on this family.");
  await recordAccess(actor, family.id, "removed", { email });
}

export async function claimInvites(user) {
  const email = String(user?.email || "").trim().toLowerCase();
  if (!email) return;
  await getPool().query(
    `INSERT INTO family_members (family_id, user_id, role, created_by, updated_by)
     SELECT i.family_id, $2, i.role, i.created_by, i.created_by
     FROM family_invites i
     JOIN families f ON f.id = i.family_id
     WHERE i.email = $1 AND f.owner_id IS DISTINCT FROM $2 AND f.deleted_at IS NULL
     ON CONFLICT (family_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [email, user.id],
  );
  await getPool().query("DELETE FROM family_invites WHERE email = $1", [email]);
}

export async function listUpdateRecipients(familyId, exceptUserId) {
  const { rows } = await getPool().query(
    `SELECT u.id, u.email, u.name
     FROM users u
     JOIN families f ON f.owner_id = u.id
     WHERE f.id = $1 AND u.id <> $2
     UNION
     SELECT u.id, u.email, u.name
     FROM family_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.family_id = $1 AND u.id <> $2`,
    [familyId, exceptUserId],
  );
  return rows;
}

export async function listLinks(userId, familyId) {
  const { rows } = await getPool().query(
    `SELECT id, token, expires_at, created_at
     FROM share_links
     WHERE family_id = $1 AND created_by = $2 AND (expires_at IS NULL OR expires_at > now())
     ORDER BY created_at DESC`,
    [familyId, userId],
  );
  return rows.map(mapLink);
}

export async function createLink(user, family, choice) {
  assertMember(family);
  const count = await getPool().query(
    `SELECT count(*)::int AS count FROM share_links
     WHERE family_id = $1 AND created_by = $2 AND (expires_at IS NULL OR expires_at > now())`,
    [family.id, user.id],
  );
  if ((count.rows[0]?.count ?? 0) >= 20) throw new HttpError(409, "You already have 20 active links for this family.");
  const expires = expiryDate(choice);
  const token = randomBytes(24).toString("base64url");
  const { rows } = await getPool().query(
    `INSERT INTO share_links (id, family_id, created_by, token, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, token, expires_at, created_at`,
    [randomUUID(), family.id, user.id, token, expires],
  );
  const link = mapLink(rows[0]);
  await recordAccess(user, family.id, "link_created", { role: choice });
  return link;
}

export async function revokeLink(user, family, linkId) {
  assertMember(family);
  const { rowCount } = await getPool().query(
    `DELETE FROM share_links
     WHERE id = $1 AND family_id = $2 AND (created_by = $3 OR $4 = true)`,
    [linkId, family.id, user.id, family.access_role === "owner"],
  );
  if (!rowCount) throw new HttpError(404, "That link was not found.");
  await recordAccess(user, family.id, "link_revoked");
}

export async function listEdits(familyId) {
  const { rows } = await getPool().query(
    `SELECT id, user_name, user_email, created_at
     FROM family_edits
     WHERE family_id = $1
     ORDER BY created_at DESC
     LIMIT 40`,
    [familyId],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.user_name,
    email: row.user_email,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

export async function recordEdit(user, before, after) {
  const sameName = before.name === after.name;
  const samePeople = JSON.stringify(asPeople(before.people)) === JSON.stringify(asPeople(after.people));
  if (sameName && samePeople) return false;
  const recent = await getPool().query(
    `SELECT id, user_id, created_at
     FROM family_edits
     WHERE family_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [after.id],
  );
  const last = recent.rows[0];
  if (last && last.user_id === user.id && Date.now() - new Date(last.created_at).getTime() < EDIT_WINDOW) {
    await getPool().query("UPDATE family_edits SET created_at = now() WHERE id = $1", [last.id]);
    return false;
  }
  await getPool().query(
    `INSERT INTO family_edits (id, family_id, user_id, user_name, user_email)
     VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), after.id, user.id, user.name || "", user.email || ""],
  );
  return true;
}

export async function listAccessEvents(familyId) {
  const { rows } = await getPool().query(
    `SELECT id, actor_name, actor_email, action, target_email, role, created_at
     FROM access_events
     WHERE family_id = $1
     ORDER BY created_at DESC
     LIMIT 40`,
    [familyId],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.actor_name,
    email: row.actor_email,
    action: row.action,
    targetEmail: row.target_email,
    role: row.role,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

export async function recordAccess(actor, familyId, action, { email = "", role = "" } = {}) {
  await getPool().query(
    `INSERT INTO access_events (id, family_id, actor_id, actor_name, actor_email, action, target_email, role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [randomUUID(), familyId, actor?.id ?? null, actor?.name || "", actor?.email || "", action, email, role],
  );
}

function memberRecord(row, pending) {
  return {
    userId: row.id,
    email: row.email,
    name: row.name || "",
    role: row.role,
    pending,
    createdBy: row.created_name || row.created_email || "",
    updatedBy: row.updated_name || row.updated_email || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

function assertMember(family) {
  if (!family?.access_role) throw new HttpError(404, "That family was not found.");
}

function mapLink(row) {
  return {
    id: row.id,
    token: row.token,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
