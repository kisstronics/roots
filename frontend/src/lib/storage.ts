import type { AccessEvent, Family, FamilyEdit, FamilyMember, FamilyRole, FamilySummary, Person, ShareLink } from "../types";
import { apiUrl, appUrl } from "./paths";
import { normalizeFamily } from "./people";

export interface OwnedFamilyList {
  families: FamilySummary[];
  maxFamilies: number;
  familyCount: number;
}

export interface FamilyAccess {
  family: Family;
  role: FamilyRole;
  viewToken: string | null;
  members: FamilyMember[];
  links: ShareLink[];
  edits: FamilyEdit[];
  accessLog: AccessEvent[];
}

export async function loadIndex(): Promise<FamilySummary[]> {
  const data = await request<{ families?: FamilySummary[] }>("/api/families/public");
  return data.families ?? [];
}

export async function loadFamily(slug: string): Promise<Family | null> {
  const normalizedSlug = slug.trim().toLocaleLowerCase("en-US");
  if (!isSafeSlug(normalizedSlug)) return null;
  try {
    const data = await request<{ family: Family }>(`/api/families/public/${normalizedSlug}`);
    return normalizeFamily(data.family);
  } catch (error) {
    if (statusOf(error) === 404) return null;
    throw error;
  }
}

export async function loadOwnedIndex(): Promise<OwnedFamilyList> {
  const data = await request<OwnedFamilyList>("/api/families");
  return {
    families: data.families ?? [],
    maxFamilies: data.maxFamilies ?? 10,
    familyCount: data.familyCount ?? 0,
  };
}

export async function loadOwnedFamily(slug: string): Promise<FamilyAccess | null> {
  const normalizedSlug = slug.trim().toLocaleLowerCase("en-US");
  if (!isSafeSlug(normalizedSlug)) return null;
  try {
    const data = await request<{
      family: Family;
      role?: FamilyRole;
      viewToken?: string | null;
      members?: FamilyMember[];
      links?: ShareLink[];
      edits?: FamilyEdit[];
      accessLog?: AccessEvent[];
    }>(`/api/families/${normalizedSlug}`);
    return {
      family: normalizeFamily(data.family),
      role: data.role ?? "owner",
      viewToken: data.viewToken ?? null,
      members: data.members ?? [],
      links: data.links ?? [],
      edits: data.edits ?? [],
      accessLog: data.accessLog ?? [],
    };
  } catch (error) {
    if (statusOf(error) === 404) return null;
    throw error;
  }
}

export async function createFamily(name: string): Promise<Family> {
  const data = await request<{ family: Family }>("/api/families", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return normalizeFamily(data.family);
}

const baselines = new Map<string, Family>();
const revisions = new Map<string, number>();
let saveQueue: Promise<unknown> = Promise.resolve();

export function rememberFamily(family: Family): Family {
  const normalized = normalizeFamily(family);
  baselines.set(normalized.slug, normalized);
  revisions.set(normalized.slug, (revisions.get(normalized.slug) ?? 0) + 1);
  return normalized;
}

export async function saveFamily(family: Family): Promise<Family> {
  return enqueueSave(family);
}

export function enqueueSave(family: Family): Promise<Family> {
  const slug = family.slug.trim().toLocaleLowerCase("en-US");
  const ticket = revisions.get(slug) ?? 0;
  const run = saveQueue.then(() => applySave(family, ticket));
  saveQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function deleteFamily(slug: string): Promise<void> {
  if (!isSafeSlug(slug)) throw new Error("That family address is not valid.");
  await request("/api/families/" + slug, { method: "DELETE" });
}

export async function shareWithUser(slug: string, email: string, role: "editor" | "viewer"): Promise<AccessChange> {
  return accessChange(
    await request<AccessChange>(`/api/families/${slug}/members`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    }),
  );
}

export async function setMemberRole(slug: string, userId: string, role: "editor" | "viewer"): Promise<AccessChange> {
  return accessChange(
    await request<AccessChange>(memberPath(slug, userId), {
      method: "PUT",
      body: JSON.stringify({ role }),
    }),
  );
}

export async function removeMember(slug: string, userId: string): Promise<AccessChange> {
  return accessChange(await request<AccessChange>(memberPath(slug, userId), { method: "DELETE" }));
}

function memberPath(slug: string, userId: string) {
  return `/api/families/${slug}/members/${encodeURIComponent(userId)}`;
}

export async function createShareLink(slug: string, expiry: "30" | "60" | "never"): Promise<AccessChange> {
  return accessChange(
    await request<AccessChange>(`/api/families/${slug}/links`, {
      method: "POST",
      body: JSON.stringify({ expiry }),
    }),
  );
}

export async function revokeShareLink(slug: string, linkId: string): Promise<AccessChange> {
  return accessChange(await request<AccessChange>(`/api/families/${slug}/links/${linkId}`, { method: "DELETE" }));
}

export async function ensureViewLink(slug: string): Promise<string> {
  const data = await request<{ shareToken: string }>(`/api/families/${slug}/view-link`, { method: "POST" });
  if (!data.shareToken) throw new Error("Could not create a view link.");
  return data.shareToken;
}

interface AccessChange {
  members?: FamilyMember[];
  links?: ShareLink[];
  accessLog?: AccessEvent[];
}

function accessChange(data: AccessChange): AccessChange {
  return { members: data.members ?? [], links: data.links ?? [], accessLog: data.accessLog ?? [] };
}

export async function generateShareLink(slug: string): Promise<string> {
  const data = await request<{ shareToken: string }>(`/api/families/${slug}/share`, { method: "POST" });
  if (!data.shareToken) throw new Error("Could not generate a link.");
  return data.shareToken;
}

export async function loadSharedFamily(token: string): Promise<Family | null> {
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(token)) return null;
  try {
    const data = await request<{ family: Family }>(`/api/share/${token}`);
    return normalizeFamily(data.family);
  } catch (error) {
    if (statusOf(error) === 404) return null;
    throw error;
  }
}

export function shareUrl(token: string): string {
  return `${window.location.origin}${appUrl(`/share/${token}`)}`;
}

export function downloadFamily(family: Family) {
  const normalized = normalizeFamily(family);
  const blob = new Blob([`${JSON.stringify(normalized, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${normalized.slug}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function isSafeSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug !== "index";
}

type SaveError = Error & { status?: number; family?: Family; stale?: boolean };

async function applySave(family: Family, ticket: number): Promise<Family> {
  const normalized = normalizeFamily(family);
  const revision = revisions.get(normalized.slug) ?? 0;
  const base = baselines.get(normalized.slug);
  if (!base) throw new Error("Reload this tree before saving.");
  if (ticket !== revision) {
    const error = new Error("Someone else updated this tree. Your change was not saved, and the latest tree is shown.") as SaveError;
    error.status = 409;
    error.stale = true;
    error.family = base;
    throw error;
  }

  const plan = planSave(base, normalized);
  try {
    for (const person of plan.profiles) {
      await request(`/api/families/${normalized.slug}/people/${encodeURIComponent(person.id)}`, {
        method: "PUT",
        body: JSON.stringify(profileOf(person)),
      });
    }
    let updatedAt = base.updatedAt;
    if (plan.structureChanged) {
      const data = await request<{ family: Family }>(`/api/families/${normalized.slug}/structure`, {
        method: "PUT",
        body: JSON.stringify({
          name: normalized.name,
          baseUpdatedAt: base.updatedAt,
          structure: plan.structure,
          people: plan.created.map((person) => ({ id: person.id, ...profileOf(person) })),
        }),
      });
      updatedAt = normalizeFamily(data.family).updatedAt;
    }
    const saved = normalizeFamily({ ...normalized, updatedAt });
    baselines.set(saved.slug, saved);
    return saved;
  } catch (error) {
    const saveError = error as SaveError;
    if (saveError.status === 409 && saveError.family) {
      saveError.family = rememberFamily(saveError.family);
    } else if (saveError.status === 404) {
      const loaded = await loadOwnedFamily(normalized.slug).catch(() => null);
      if (loaded) {
        saveError.family = rememberFamily(loaded.family);
        saveError.message = "This tree changed. Your last change was not saved, and the latest tree is shown.";
      }
    }
    throw error;
  }
}

function planSave(base: Family, next: Family) {
  const previous = new Map(base.people.map((person) => [person.id, person]));
  const upcoming = new Map(next.people.map((person) => [person.id, person]));
  const profiles = next.people.filter((person) => {
    const before = previous.get(person.id);
    return before ? !sameProfile(before, person) : false;
  });
  const created = next.people.filter((person) => !previous.has(person.id));
  const structureChanged =
    base.name !== next.name ||
    base.people.length !== next.people.length ||
    next.people.some((person) => {
      const before = previous.get(person.id);
      return !before || !sameLinks(before, person);
    }) ||
    base.people.some((person) => !upcoming.has(person.id));
  return {
    profiles,
    created,
    structureChanged,
    structure: next.people.map(linksOf),
  };
}

function sameProfile(left: Person, right: Person): boolean {
  return (
    left.firstName === right.firstName &&
    left.lastName === right.lastName &&
    left.gender === right.gender &&
    left.living === right.living &&
    left.birthYear === right.birthYear &&
    left.deathYear === right.deathYear &&
    left.birthday === right.birthday &&
    left.deathday === right.deathday &&
    left.birthLocation === right.birthLocation &&
    left.currentLocation === right.currentLocation &&
    left.notes === right.notes &&
    left.photo === right.photo
  );
}

function sameLinks(left: Person, right: Person): boolean {
  return sameList(left.parentIds, right.parentIds) && sameList(left.spouseIds, right.spouseIds) && sameList(left.siblingIds, right.siblingIds);
}

function sameList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function profileOf(person: Person) {
  return {
    firstName: person.firstName,
    lastName: person.lastName,
    gender: person.gender,
    living: person.living,
    birthYear: person.birthYear,
    deathYear: person.deathYear,
    birthday: person.birthday,
    deathday: person.deathday,
    birthLocation: person.birthLocation,
    currentLocation: person.currentLocation,
    notes: person.notes,
    photo: person.photo,
  };
}

function linksOf(person: Person) {
  return {
    id: person.id,
    parentIds: person.parentIds,
    spouseIds: person.spouseIds,
    siblingIds: person.siblingIds,
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(apiUrl(path), { ...init, headers, credentials: "include" });
  const data = (await response.json().catch(() => null)) as (T & { error?: string; family?: Family }) | null;
  if (!response.ok) {
    const error = new Error(data?.error || "The request failed.") as SaveError;
    error.status = response.status;
    if (data?.family) error.family = data.family;
    throw error;
  }
  return data as T;
}

function statusOf(error: unknown): number | undefined {
  return typeof error === "object" && error && "status" in error ? Number(error.status) : undefined;
}
