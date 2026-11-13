import type { Family, Gender, Person } from "../types";

export function indexPeople(people: Person[]): Map<string, Person> {
  return new Map(people.map((person) => [person.id, person]));
}

export function fullName(person: Person): string {
  return `${person.firstName} ${person.lastName}`.trim();
}

export function lifeYears(person: Person): string {
  const born = person.birthday ? formatDate(person.birthday) : person.birthYear ? String(person.birthYear) : "";
  const died = person.living
    ? ""
    : person.deathday
      ? formatDate(person.deathday)
      : person.deathYear
        ? String(person.deathYear)
        : "";
  if (born && died) return `${born} – ${died}`;
  if (born) return person.living ? born : `b. ${born}`;
  if (died) return `d. ${died}`;
  return person.living ? "Living" : "Deceased";
}

export function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[Number(match[2]) - 1];
  if (!month) return value;
  return `${Number(match[3])} ${month} ${match[1]}`;
}

export function yearFromDate(value: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(value);
  return match ? Number(match[1]) : null;
}

export function initials(person: Person): string {
  return `${person.firstName[0] ?? ""}${person.lastName[0] ?? ""}`.toUpperCase() || "?";
}

export function byBirth(a: Person, b: Person): number {
  const ay = a.birthYear ?? 99999;
  const by = b.birthYear ?? 99999;
  if (ay !== by) return ay - by;
  return fullName(a).localeCompare(fullName(b));
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function uniqueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of value) {
    const id = String(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function normalizePerson(person: Person): Person {
  const birthday = toDate(person.birthday);
  const deathday = toDate(person.deathday);
  const recordedDeath = yearFromDate(deathday) ?? toYear(person.deathYear);
  const living = typeof person.living === "boolean" ? person.living : recordedDeath === null && deathday === null;
  return {
    id: String(person.id),
    firstName: String(person.firstName ?? "").trim(),
    lastName: String(person.lastName ?? "").trim(),
    gender: person.gender === "female" ? "female" : "male",
    living,
    birthYear: yearFromDate(birthday) ?? toYear(person.birthYear),
    deathYear: living ? null : recordedDeath,
    birthday,
    deathday: living ? null : deathday,
    birthLocation: toText(person.birthLocation, 120),
    currentLocation: toText(person.currentLocation, 120),
    notes: toText(person.notes, 500),
    parentIds: uniqueIds(person.parentIds),
    spouseIds: uniqueIds(person.spouseIds),
    siblingIds: uniqueIds(person.siblingIds),
    photo: toPhoto(person.photo),
  };
}

function toPhoto(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const photo = value.trim();
  if (!photo.startsWith("data:image/")) return null;
  return photo;
}

function toYear(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const year = Number(value);
  if (!Number.isInteger(year)) return null;
  return year;
}

function toDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

function toText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function normalizeFamily(raw: Family): Family {
  const people: Person[] = (raw.people ?? []).map((person) => normalizePerson(person));

  const ids = new Set(people.map((person) => person.id));
  for (const person of people) {
    person.parentIds = person.parentIds.filter((id) => ids.has(id) && id !== person.id);
    person.spouseIds = person.spouseIds.filter((id) => ids.has(id) && id !== person.id);
    person.siblingIds = person.siblingIds.filter((id) => ids.has(id) && id !== person.id);
  }

  const byId = indexPeople(people);
  for (const person of people) {
    for (const spouseId of person.spouseIds) {
      const spouse = byId.get(spouseId);
      if (spouse && !spouse.spouseIds.includes(person.id)) spouse.spouseIds.push(person.id);
    }
    for (const siblingId of person.siblingIds) {
      const sibling = byId.get(siblingId);
      if (sibling && !sibling.siblingIds.includes(person.id)) sibling.siblingIds.push(person.id);
    }
  }

  return {
    slug: raw.slug,
    name: raw.name,
    people,
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

export function childrenOf(person: Person, people: Person[]): Person[] {
  return people.filter((other) => other.parentIds.includes(person.id)).sort(byBirth);
}

export function siblingsOf(person: Person, people: Person[]): Person[] {
  const ids = new Set<string>();
  if (person.parentIds.length) {
    for (const other of people) {
      if (other.id === person.id) continue;
      if (other.parentIds.some((id) => person.parentIds.includes(id))) ids.add(other.id);
    }
  }
  for (const siblingId of person.siblingIds) ids.add(siblingId);
  ids.delete(person.id);
  return people.filter((other) => ids.has(other.id)).sort(byBirth);
}

export function spousesOf(person: Person, people: Person[]): Person[] {
  const byId = indexPeople(people);
  return person.spouseIds
    .map((id) => byId.get(id))
    .filter((spouse): spouse is Person => Boolean(spouse))
    .sort(byBirth);
}

export function parentsOf(person: Person, people: Person[]): Person[] {
  const byId = indexPeople(people);
  return person.parentIds
    .map((id) => byId.get(id))
    .filter((parent): parent is Person => Boolean(parent))
    .sort(byBirth);
}

export function parentOfGender(person: Person, people: Person[], gender: Gender): Person | undefined {
  return parentsOf(person, people).find((parent) => parent.gender === gender);
}

export function defaultFocusId(people: Person[]): string | null {
  if (!people.length) return null;
  let best = people[0];
  let bestScore = -1;
  for (const person of people) {
    const children = childrenOf(person, people).length;
    const score =
      (person.parentIds.length ? 2 : 0) + children * 2 + (person.spouseIds.length ? 1 : 0);
    if (score > bestScore) {
      best = person;
      bestScore = score;
    }
  }
  return best.id;
}

export function countGenerations(people: Person[]): number {
  if (!people.length) return 0;
  const byId = indexPeople(people);
  const memo = new Map<string, number>();

  function depth(id: string, stack: Set<string>): number {
    const cached = memo.get(id);
    if (cached) return cached;
    if (stack.has(id)) return 1;
    const person = byId.get(id);
    if (!person || person.parentIds.length === 0) {
      memo.set(id, 1);
      return 1;
    }
    stack.add(id);
    const value = 1 + Math.max(...person.parentIds.map((parentId) => depth(parentId, stack)));
    stack.delete(id);
    memo.set(id, value);
    return value;
  }

  return Math.max(...people.map((person) => depth(person.id, new Set())));
}

export function genderLabel(gender: Gender): string {
  return gender === "male" ? "Male" : "Female";
}
