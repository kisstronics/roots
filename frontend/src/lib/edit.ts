import type { Family, Gender, NewPersonInput, Person, RelationKind } from "../types";
import { fullName, parentOfGender, siblingsOf } from "./people";

export function createPerson(input: NewPersonInput): Person {
  return {
    id: createId(),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    gender: input.gender,
    living: input.living,
    birthYear: input.birthYear,
    deathYear: input.living ? null : input.deathYear,
    birthday: input.birthday,
    deathday: input.living ? null : input.deathday,
    birthLocation: input.birthLocation.trim(),
    currentLocation: input.currentLocation.trim(),
    notes: input.notes.trim().slice(0, 500),
    photo: input.photo,
    parentIds: [],
    spouseIds: [],
    siblingIds: [],
  };
}

export function addRelative(
  family: Family,
  selectedId: string,
  kind: RelationKind,
  input: NewPersonInput,
): { family: Family; person: Person } {
  assertPersonInput(input);
  const people = clonePeople(family.people);
  const selected = people.find((person) => person.id === selectedId);
  if (!selected) throw new Error("That person is no longer in this family.");

  const gender = genderFor(kind, input, selected);
  const person = createPerson({ ...input, gender });

  if (kind === "spouse") {
    linkSpouses(selected, person);
  } else if (kind === "son" || kind === "daughter") {
    const otherParentId = input.otherParentId;
    if (otherParentId === selected.id) throw new Error("The other parent has to be a different person.");
    if (otherParentId && !people.some((member) => member.id === otherParentId)) {
      throw new Error("Choose a parent who is already in the family.");
    }
    person.parentIds = otherParentId ? [selected.id, otherParentId] : [selected.id];
  } else if (kind === "brother" || kind === "sister") {
    if (selected.parentIds.length) {
      person.parentIds = [...selected.parentIds];
    } else {
      for (const member of siblingClosure(selected, people)) linkSiblings(member, person);
    }
  } else {
    const existing = parentOfGender(selected, people, gender);
    if (existing) {
      throw new Error(
        `${fullName(selected)} already has a ${gender === "male" ? "father" : "mother"}: ${fullName(existing)}.`,
      );
    }
    const group = sameParentGroup(selected, people);
    for (const member of group) {
      if (member.parentIds.includes(person.id)) continue;
      if (member.parentIds.length >= 2) continue;
      if (parentOfGender(member, people, gender)) continue;
      member.parentIds.push(person.id);
    }
    const opposite: Gender = gender === "male" ? "female" : "male";
    const coParent = parentOfGender(selected, people, opposite);
    if (coParent) linkSpouses(coParent, person);
  }

  people.push(person);
  return { family: stamp(family, people), person };
}

export function updatePerson(family: Family, personId: string, input: NewPersonInput): Family {
  assertPersonInput(input);
  const people = clonePeople(family.people);
  const person = people.find((member) => member.id === personId);
  if (!person) throw new Error("That person is no longer in this family.");
  person.firstName = input.firstName.trim();
  person.lastName = input.lastName.trim();
  person.gender = input.gender;
  person.living = input.living;
  person.birthYear = input.birthYear;
  person.deathYear = input.living ? null : input.deathYear;
  person.birthday = input.birthday;
  person.deathday = input.living ? null : input.deathday;
  person.birthLocation = input.birthLocation.trim();
  person.currentLocation = input.currentLocation.trim();
  person.notes = input.notes.trim().slice(0, 500);
  person.photo = input.photo;
  return stamp(family, people);
}

export function removePerson(family: Family, personId: string): Family {
  const people = clonePeople(family.people).filter((person) => person.id !== personId);
  for (const person of people) {
    person.parentIds = person.parentIds.filter((id) => id !== personId);
    person.spouseIds = person.spouseIds.filter((id) => id !== personId);
    person.siblingIds = person.siblingIds.filter((id) => id !== personId);
  }
  return stamp(family, people);
}

export function emptyFamily(name: string, slug: string): Family {
  return {
    slug,
    name: name.trim(),
    people: [],
    updatedAt: new Date().toISOString(),
  };
}

function stamp(family: Family, people: Person[]): Family {
  return { ...family, people, updatedAt: new Date().toISOString() };
}

function clonePeople(people: Person[]): Person[] {
  return people.map((person) => ({
    ...person,
    parentIds: [...person.parentIds],
    spouseIds: [...person.spouseIds],
    siblingIds: [...person.siblingIds],
  }));
}

function genderFor(kind: RelationKind, input: NewPersonInput, selected: Person): Gender {
  if (kind === "son" || kind === "brother" || kind === "father") return "male";
  if (kind === "daughter" || kind === "sister" || kind === "mother") return "female";
  return input.gender || (selected.gender === "male" ? "female" : "male");
}

function assertPersonInput(input: NewPersonInput) {
  if (!input.firstName.trim()) throw new Error("Enter a first name.");
  if (!input.lastName.trim()) throw new Error("Enter a last name.");
  if (input.notes.trim().length > 500) throw new Error("Notes can be at most 500 characters.");
  if (input.birthday && input.deathday && input.deathday < input.birthday) {
    throw new Error("Death day cannot be earlier than the birthday.");
  }
  if (input.birthYear !== null && input.deathYear !== null && input.deathYear < input.birthYear) {
    throw new Error("Death day cannot be earlier than the birthday.");
  }
}

function linkSpouses(a: Person, b: Person) {
  if (!a.spouseIds.includes(b.id)) a.spouseIds.push(b.id);
  if (!b.spouseIds.includes(a.id)) b.spouseIds.push(a.id);
}

function linkSiblings(a: Person, b: Person) {
  if (a.id === b.id) return;
  if (!a.siblingIds.includes(b.id)) a.siblingIds.push(b.id);
  if (!b.siblingIds.includes(a.id)) b.siblingIds.push(a.id);
}

function sameParentGroup(selected: Person, people: Person[]): Person[] {
  if (!selected.parentIds.length) return siblingClosure(selected, people);
  const key = parentKey(selected.parentIds);
  return people.filter((person) => parentKey(person.parentIds) === key);
}

function siblingClosure(selected: Person, people: Person[]): Person[] {
  const byId = new Map(people.map((person) => [person.id, person]));
  const seen = new Set<string>();
  const queue = [selected.id];
  while (queue.length) {
    const id = queue.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const person = id === selected.id ? selected : byId.get(id);
    if (!person) continue;
    for (const siblingId of person.siblingIds) queue.push(siblingId);
    for (const sibling of siblingsOf(person, people)) queue.push(sibling.id);
  }
  return [...seen]
    .map((id) => (id === selected.id ? selected : byId.get(id)))
    .filter((person): person is Person => Boolean(person));
}

function parentKey(ids: string[]): string {
  return [...ids].sort().join("|");
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}
