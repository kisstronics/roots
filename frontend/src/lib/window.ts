import type { Person } from "../types";
import { byBirth, indexPeople, siblingsOf } from "./people";

export interface ChildUnit {
  person: Person;
  spouses: Person[];
}

export interface Household {
  anchor: Person;
  spouses: Person[];
  children: ChildUnit[];
}

export interface GenerationWindow {
  focus: Person;
  parents: Person[];
  households: Household[];
}

export function buildWindow(people: Person[], focusId: string): GenerationWindow | null {
  const byId = indexPeople(people);
  const focus = byId.get(focusId);
  if (!focus) return null;

  const blood = [focus, ...siblingsOf(focus, people)].sort(byBirth);
  const bloodIds = new Set(blood.map((person) => person.id));
  const biologicalParentIds = unique(blood.flatMap((person) => person.parentIds)).filter(
    (id) => !bloodIds.has(id) && byId.has(id),
  );
  const parentIds = new Set(biologicalParentIds);

  for (const parentId of biologicalParentIds) {
    const parent = byId.get(parentId);
    if (!parent) continue;
    for (const spouseId of parent.spouseIds) {
      if (parentIds.has(spouseId) || bloodIds.has(spouseId)) continue;
      const spouse = byId.get(spouseId);
      if (!spouse) continue;
      if (spouse.parentIds.some((id) => bloodIds.has(id))) continue;
      parentIds.add(spouseId);
    }
  }

  const parents = [...parentIds]
    .map((id) => byId.get(id))
    .filter((person): person is Person => Boolean(person))
    .sort(byBirth);

  const childPeople = people
    .filter(
      (person) =>
        !bloodIds.has(person.id) &&
        !parentIds.has(person.id) &&
        person.parentIds.some((id) => bloodIds.has(id)),
    )
    .sort(byBirth);

  const occupied = new Set<string>([
    ...bloodIds,
    ...parentIds,
    ...childPeople.map((person) => person.id),
  ]);

  function partners(person: Person): Person[] {
    const list: Person[] = [];
    for (const spouseId of person.spouseIds) {
      if (occupied.has(spouseId)) continue;
      const spouse = byId.get(spouseId);
      if (!spouse) continue;
      occupied.add(spouseId);
      list.push(spouse);
    }
    return list.sort(byBirth);
  }

  const assignedChildren = new Set<string>();
  const households: Household[] = blood.map((anchor) => {
    const spouses = partners(anchor);
    const children = childPeople
      .filter((child) => {
        if (assignedChildren.has(child.id)) return false;
        if (!child.parentIds.includes(anchor.id)) return false;
        assignedChildren.add(child.id);
        return true;
      })
      .map((child) => ({ person: child, spouses: partners(child) }));
    return { anchor, spouses, children };
  });

  return { focus, parents, households };
}

export function windowIds(people: Person[], focusId: string): Set<string> {
  const view = buildWindow(people, focusId);
  const ids = new Set<string>();
  if (!view) return ids;
  for (const parent of view.parents) ids.add(parent.id);
  for (const household of view.households) {
    ids.add(household.anchor.id);
    for (const spouse of household.spouses) ids.add(spouse.id);
    for (const child of household.children) {
      ids.add(child.person.id);
      for (const spouse of child.spouses) ids.add(spouse.id);
    }
  }
  return ids;
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}
