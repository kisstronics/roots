import type { AccessEvent, Family, FamilyEdit, FamilyMember, FamilyRole, FamilySummary, ShareLink } from "../types";
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

export async function saveFamily(family: Family): Promise<void> {
  const normalized = normalizeFamily(family);
  await request(`/api/families/${normalized.slug}`, {
    method: "PUT",
    body: JSON.stringify(normalized),
  });
}

let saveQueue: Promise<unknown> = Promise.resolve();

export function enqueueSave(family: Family): Promise<void> {
  const run = saveQueue.then(() => saveFamily(family));
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(apiUrl(path), { ...init, headers, credentials: "include" });
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    const error = new Error(data?.error || "The request failed.") as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return data as T;
}

function statusOf(error: unknown): number | undefined {
  return typeof error === "object" && error && "status" in error ? Number(error.status) : undefined;
}
