import type { Family, FamilySummary } from "../types";
import { apiUrl, appUrl } from "./paths";
import { normalizeFamily } from "./people";

export interface OwnedFamilyList {
  families: FamilySummary[];
  maxFamilies: number;
  familyCount: number;
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

export async function loadOwnedFamily(slug: string): Promise<{ family: Family; shareToken: string | null } | null> {
  const normalizedSlug = slug.trim().toLocaleLowerCase("en-US");
  if (!isSafeSlug(normalizedSlug)) return null;
  try {
    const data = await request<{ family: Family; shareToken?: string | null }>(`/api/families/${normalizedSlug}`);
    return { family: normalizeFamily(data.family), shareToken: data.shareToken ?? null };
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
