import type { Person } from "../types";
import { byBirth, childrenOf, fullName, indexPeople, spousesOf } from "./people";
import { buildWindow, type ChildUnit, type Household } from "./window";

export const CARD_W = 236;
export const CARD_H = 248;
export const CARD_PHOTO_ASPECT = (CARD_W - 6) / ((CARD_H - 2) * 0.75);

const PAD_X = 56;
const PAD_Y = 72;
const COUPLE_GAP = 36;
const UNIT_GAP = 32;
const HOUSE_GAP = 78;
const GEN_GAP = 136;
const BUS_OFFSET = 68;
const SPOUSE_DROP = 16;

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  generation: number;
  role: "focus" | "parent" | "sibling" | "spouse" | "child" | "member";
}

export interface LayoutMatch {
  a: string;
  b: string;
}

export interface LayoutEdge {
  id: string;
  kind: "spouse" | "parent";
  title: string;
  d: string;
  d2?: string;
  childId: string | null;
  matches: LayoutMatch[];
}

export interface LayoutBand {
  generation: number;
  label: string;
  y: number;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  bands: LayoutBand[];
  width: number;
  height: number;
}

interface PlacedChild extends ChildUnit {
  x: number;
}

interface PlacedHousehold {
  anchor: Person;
  spouses: Person[];
  children: PlacedChild[];
  x: number;
  width: number;
  topX: number;
}

export function layoutTree(people: Person[], focusId: string): LayoutResult | null {
  const view = buildWindow(people, focusId);
  if (!view) return null;

  let cursor = 0;
  const placed: PlacedHousehold[] = view.households.map((household) => {
    const topCount = 1 + household.spouses.length;
    const topWidth = unitWidth(topCount);
    const childWidths = household.children.map((child) => unitWidth(1 + child.spouses.length));
    const childrenWidth =
      childWidths.reduce((sum, width) => sum + width, 0) +
      Math.max(0, household.children.length - 1) * UNIT_GAP;
    const width = Math.max(topWidth, childrenWidth, CARD_W);
    const topX = cursor + (width - topWidth) / 2;
    let childCursor = cursor + Math.max(0, (width - childrenWidth) / 2);
    const children = household.children.map((child, index) => {
      const x = childCursor;
      childCursor += childWidths[index] + UNIT_GAP;
      return { ...child, x };
    });
    const item: PlacedHousehold = { ...household, x: cursor, width, topX, children };
    cursor += width + HOUSE_GAP;
    return item;
  });

  const rowWidth = Math.max(CARD_W, cursor - HOUSE_GAP);
  const groups = clusterParents(view.parents);
  const groupWidths = groups.map((group) => unitWidth(group.length));
  const parentsWidth =
    groupWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, groups.length - 1) * HOUSE_GAP;
  const parentsStart = groups.length ? (rowWidth - parentsWidth) / 2 : 0;
  const hasParents = groups.length > 0;
  const hasChildren = placed.some((household) => household.children.length > 0);
  const parentY = PAD_Y;
  const selfY = hasParents ? PAD_Y + CARD_H + GEN_GAP : PAD_Y;
  const childY = selfY + CARD_H + GEN_GAP;

  let minX = 0;
  let maxRight = rowWidth;
  if (hasParents) {
    minX = Math.min(minX, parentsStart);
    maxRight = Math.max(maxRight, parentsStart + parentsWidth);
  }
  const shift = PAD_X - minX;
  const nodes: LayoutNode[] = [];
  const seen = new Set<string>();

  function addNode(person: Person, x: number, y: number, generation: number, role: LayoutNode["role"]) {
    if (seen.has(person.id)) return;
    seen.add(person.id);
    nodes.push({
      id: person.id,
      x: Math.round(x + shift),
      y: Math.round(y),
      generation,
      role,
    });
  }

  const groupPlacements: { people: Person[]; x: number }[] = [];
  if (hasParents) {
    let groupX = parentsStart;
    groups.forEach((group, index) => {
      groupPlacements.push({ people: group, x: groupX });
      group.forEach((person, personIndex) => {
        addNode(person, groupX + personIndex * (CARD_W + COUPLE_GAP), parentY, -1, "parent");
      });
      groupX += groupWidths[index] + HOUSE_GAP;
    });
  }

  for (const household of placed) {
    const role = household.anchor.id === view.focus.id ? "focus" : "sibling";
    addNode(household.anchor, household.topX, selfY, 0, role);
    household.spouses.forEach((spouse, index) => {
      addNode(spouse, household.topX + (index + 1) * (CARD_W + COUPLE_GAP), selfY, 0, "spouse");
    });
    if (hasChildren) {
      for (const child of household.children) {
        addNode(child.person, child.x, childY, 1, "child");
        child.spouses.forEach((spouse, index) => {
          addNode(spouse, child.x + (index + 1) * (CARD_W + COUPLE_GAP), childY, 1, "spouse");
        });
      }
    }
  }

  const pos = new Map(nodes.map((node) => [node.id, node]));
  const byId = new Map<string, Person>();
  for (const person of people) byId.set(person.id, person);
  const edges: LayoutEdge[] = [];

  function personName(id: string): string {
    const person = byId.get(id);
    return person ? fullName(person) : "Someone";
  }

  for (const group of groupPlacements) {
    addSpouseLinks(group.people.map((person) => person.id), pos, edges, personName);
    const ids = group.people.map((person) => person.id);
    const idSet = new Set(ids);
    const targets = placed.filter((household) => household.anchor.parentIds.some((id) => idSet.has(id)));
    const junction = coupleJunction(ids, pos);
    if (!junction) continue;
    for (const household of targets) {
      const child = pos.get(household.anchor.id);
      if (!child) continue;
      const matchedParents = household.anchor.parentIds.filter((id) => idSet.has(id));
      edges.push({
        id: `parent:${ids.join("+")}:${household.anchor.id}`,
        kind: "parent",
        title: `${matchedParents.map(personName).join(" and ")} to ${personName(household.anchor.id)}`,
        d: stem(junction.x, junction.y, child.x + CARD_W / 2, child.y, parentY + CARD_H + BUS_OFFSET),
        childId: household.anchor.id,
        matches: matchedParents.map((parentId) => ({ a: parentId, b: household.anchor.id })),
      });
    }
  }

  for (const household of placed) {
    const topIds = [household.anchor.id, ...household.spouses.map((spouse) => spouse.id)];
    addSpouseLinks(topIds, pos, edges, personName);
    if (!household.children.length) continue;
    const junctionIds = junctionIdsForHousehold(household);
    const junction = coupleJunction(junctionIds, pos);
    if (!junction) continue;
    for (const child of household.children) {
      addSpouseLinks(
        [child.person.id, ...child.spouses.map((spouse) => spouse.id)],
        pos,
        edges,
        personName,
      );
      const childNode = pos.get(child.person.id);
      if (!childNode) continue;
      const matchedParents = child.person.parentIds.filter((id) => topIds.includes(id));
      const parentsForTitle = matchedParents.length ? matchedParents : [household.anchor.id];
      edges.push({
        id: `parent:${household.anchor.id}:${child.person.id}`,
        kind: "parent",
        title: `${parentsForTitle.map(personName).join(" and ")} to ${personName(child.person.id)}`,
        d: stem(junction.x, junction.y, childNode.x + CARD_W / 2, childNode.y, childY - (GEN_GAP - BUS_OFFSET)),
        childId: child.person.id,
        matches: parentsForTitle.map((parentId) => ({ a: parentId, b: child.person.id })),
      });
    }
  }

  const bands: LayoutBand[] = [];
  if (hasParents) bands.push({ generation: -1, label: "Parents", y: parentY });
  bands.push({
    generation: 0,
    label: `${view.focus.firstName}'s generation`,
    y: selfY,
  });
  if (hasChildren) bands.push({ generation: 1, label: "Children", y: childY });

  const maxX = Math.max(...nodes.map((node) => node.x + CARD_W), PAD_X + CARD_W);
  const maxY = Math.max(...nodes.map((node) => node.y + CARD_H), PAD_Y + CARD_H);

  return {
    nodes,
    edges,
    bands,
    width: maxX + PAD_X,
    height: maxY + 78,
  };
}

interface TreeUnion {
  parentIds: string[];
  children: TreeUnit[];
  relX: number;
  width: number;
}

interface TreeUnit {
  anchorId: string;
  members: Person[];
  generation: number;
  unions: TreeUnion[];
  x: number;
  width: number;
  topX: number;
  memberRelX: number[];
}

export function layoutFullTree(people: Person[]): LayoutResult | null {
  if (!people.length) return null;
  const byId = indexPeople(people);
  const generationOf = assignGenerations(people);
  const placed = new Set<string>();
  const units: TreeUnit[] = [];

  function isMarriedIn(person: Person): boolean {
    if (person.parentIds.some((id) => byId.has(id))) return false;
    return spousesOf(person, people).some((spouse) => spouse.parentIds.some((id) => byId.has(id)));
  }

  function attachableSpouses(anchor: Person): Person[] {
    return spousesOf(anchor, people)
      .filter((spouse) => !placed.has(spouse.id) && !spouse.parentIds.some((id) => byId.has(id)))
      .sort(byBirth);
  }

  function buildUnit(anchor: Person): TreeUnit {
    placed.add(anchor.id);
    const spouses = attachableSpouses(anchor);
    for (const spouse of spouses) placed.add(spouse.id);
    const members = arrangeHousehold(anchor, spouses);
    const generation = generationOf.get(anchor.id) ?? 0;
    const memberIds = new Set(members.map((person) => person.id));
    const childPeople = people
      .filter((person) => {
        if (placed.has(person.id)) return false;
        if ((generationOf.get(person.id) ?? 0) !== generation + 1) return false;
        return person.parentIds.some((id) => memberIds.has(id));
      })
      .sort(byBirth);
    const groups = new Map<string, TreeUnion>();
    for (const child of childPeople) {
      const parentIds = parentsForChild(child, anchor.id, members);
      const key = parentIds.join("+");
      const group = groups.get(key) ?? { parentIds, children: [], relX: 0, width: 0 };
      group.children.push(buildUnit(child));
      groups.set(key, group);
    }
    const unions = [...groups.values()].sort(
      (a, b) => unionSortKey(a.parentIds, members) - unionSortKey(b.parentIds, members),
    );
    return {
      anchorId: anchor.id,
      members,
      generation,
      unions,
      x: 0,
      width: 0,
      topX: 0,
      memberRelX: [],
    };
  }

  function chooseAnchor(start: Person): Person {
    const cluster: Person[] = [];
    const seen = new Set<string>();
    const queue = [start];
    while (queue.length) {
      const person = queue.shift();
      if (!person || seen.has(person.id)) continue;
      if (person.parentIds.some((id) => byId.has(id))) continue;
      seen.add(person.id);
      cluster.push(person);
      for (const spouse of spousesOf(person, people)) queue.push(spouse);
    }
    const ranked = [...cluster].sort((a, b) => {
      const children = childrenOf(b, people).length - childrenOf(a, people).length;
      if (children !== 0) return children;
      if (a.gender !== b.gender) return a.gender === "male" ? -1 : 1;
      return byBirth(a, b);
    });
    return ranked[0] ?? start;
  }

  const claimed = new Set<string>();
  const parentless = people
    .filter((person) => !person.parentIds.some((id) => byId.has(id)) && !isMarriedIn(person))
    .sort(byBirth);
  for (const person of parentless) {
    if (claimed.has(person.id) || placed.has(person.id)) continue;
    const anchor = chooseAnchor(person);
    if (claimed.has(anchor.id) || placed.has(anchor.id)) continue;
    claimed.add(anchor.id);
    for (const spouse of spousesOf(anchor, people)) {
      if (!spouse.parentIds.some((id) => byId.has(id))) claimed.add(spouse.id);
    }
    units.push(buildUnit(anchor));
  }
  for (const person of [...people].sort(byBirth)) {
    if (!placed.has(person.id) && !isMarriedIn(person)) units.push(buildUnit(person));
  }
  for (const person of [...people].sort(byBirth)) {
    if (!placed.has(person.id)) units.push(buildUnit(person));
  }

  for (const unit of units) measureUnit(unit);
  let cursor = 0;
  for (const unit of units) {
    placeUnit(unit, cursor);
    cursor += unit.width + HOUSE_GAP;
  }

  const nodes: LayoutNode[] = [];
  const seen = new Set<string>();
  function addNode(person: Person, x: number, y: number, generation: number, role: LayoutNode["role"]) {
    if (seen.has(person.id)) return;
    seen.add(person.id);
    nodes.push({
      id: person.id,
      x: Math.round(x + PAD_X),
      y: Math.round(y),
      generation,
      role,
    });
  }

  function walkNodes(unit: TreeUnit) {
    const y = PAD_Y + unit.generation * (CARD_H + GEN_GAP);
    unit.members.forEach((person, index) => {
      addNode(
        person,
        unit.x + (unit.memberRelX[index] ?? 0),
        y,
        unit.generation,
        person.id === unit.anchorId ? "member" : "spouse",
      );
    });
    for (const union of unit.unions) {
      for (const child of union.children) walkNodes(child);
    }
  }
  for (const unit of units) walkNodes(unit);
  if (!nodes.length) return null;

  const pos = new Map(nodes.map((node) => [node.id, node]));
  const edges: LayoutEdge[] = [];
  function personName(id: string): string {
    const person = byId.get(id);
    return person ? fullName(person) : "Someone";
  }

  function walkEdges(unit: TreeUnit) {
    for (let left = 0; left < unit.members.length; left += 1) {
      for (let right = left + 1; right < unit.members.length; right += 1) {
        const a = unit.members[left];
        const b = unit.members[right];
        if (a.spouseIds.includes(b.id)) addSpouseLinks([a.id, b.id], pos, edges, personName);
      }
    }
    const busY = PAD_Y + unit.generation * (CARD_H + GEN_GAP) + CARD_H + BUS_OFFSET;
    for (const union of unit.unions) {
      const junction = coupleJunction(union.parentIds, pos);
      for (const child of union.children) {
        const childId = child.anchorId;
        const childNode = pos.get(childId);
        if (junction && childNode) {
          edges.push({
            id: `parent:${union.parentIds.join("+")}:${childId}`,
            kind: "parent",
            title: `${union.parentIds.map(personName).join(" and ")} to ${personName(childId)}`,
            d: stem(junction.x, junction.y, childNode.x + CARD_W / 2, childNode.y, busY),
            childId,
            matches: union.parentIds.map((parentId) => ({ a: parentId, b: childId })),
          });
        }
        walkEdges(child);
      }
    }
  }
  for (const unit of units) walkEdges(unit);

  for (const person of people) {
    for (const spouseId of person.spouseIds) {
      if (person.id >= spouseId) continue;
      const [first, second] = [person.id, spouseId].sort();
      const id = `spouse:${first}:${second}`;
      if (edges.some((edge) => edge.id === id)) continue;
      const left = pos.get(person.id);
      const right = pos.get(spouseId);
      if (!left || !right) continue;
      const x1 = left.x + CARD_W / 2;
      const x2 = right.x + CARD_W / 2;
      const y1 = left.y + CARD_H;
      const y2 = right.y + CARD_H;
      const bar = Math.max(y1, y2) + SPOUSE_DROP;
      edges.push({
        id,
        kind: "spouse",
        title: `${personName(person.id)} and ${personName(spouseId)}, spouses`,
        d: `M ${x1} ${y1} L ${x1} ${bar} L ${x2} ${bar} L ${x2} ${y2}`,
        d2: `M ${x1} ${bar - 6} L ${x2} ${bar - 6}`,
        childId: null,
        matches: [{ a: person.id, b: spouseId }],
      });
    }
  }

  const generations = [...new Set(nodes.map((node) => node.generation))].sort((a, b) => a - b);
  const bands: LayoutBand[] = generations.map((generation) => ({
    generation,
    label: `Generation ${generation + 1}`,
    y: PAD_Y + generation * (CARD_H + GEN_GAP),
  }));
  const maxX = Math.max(...nodes.map((node) => node.x + CARD_W), PAD_X + CARD_W);
  const maxY = Math.max(...nodes.map((node) => node.y + CARD_H), PAD_Y + CARD_H);
  return {
    nodes,
    edges,
    bands,
    width: maxX + PAD_X,
    height: maxY + 78,
  };
}

function arrangeHousehold(anchor: Person, spouses: Person[]): Person[] {
  if (spouses.length <= 1) return [anchor, ...spouses];
  const leftCount = Math.floor(spouses.length / 2);
  return [...spouses.slice(0, leftCount).reverse(), anchor, ...spouses.slice(leftCount)];
}

function parentsForChild(child: Person, anchorId: string, members: Person[]): string[] {
  const memberIds = new Set(members.map((person) => person.id));
  const parents = child.parentIds.filter((id) => memberIds.has(id));
  const others = parents.filter((id) => id !== anchorId);
  let chosen = [anchorId];
  if (parents.includes(anchorId) && others.length === 1) chosen = [anchorId, others[0]];
  else if (parents.includes(anchorId) && others.length === 0) chosen = [anchorId];
  else if (others.length === 1) chosen = [others[0]];
  else if (parents.length) chosen = parents;
  return [...chosen].sort(
    (a, b) => members.findIndex((person) => person.id === a) - members.findIndex((person) => person.id === b),
  );
}

function unionSortKey(parentIds: string[], members: Person[]): number {
  const indexes = parentIds.map((id) => members.findIndex((person) => person.id === id));
  return indexes.reduce((sum, index) => sum + index, 0) / indexes.length;
}

function unionContentWidth(union: TreeUnion): number {
  let width = 0;
  union.children.forEach((child, index) => {
    width += child.width;
    if (index > 0) width += HOUSE_GAP;
  });
  return width;
}

function measureUnit(unit: TreeUnit): number {
  for (const union of unit.unions) {
    for (const child of union.children) measureUnit(child);
  }
  const layout = resolveHousehold(unit);
  unit.memberRelX = layout.memberRelX;
  unit.unions.forEach((union, index) => {
    union.relX = layout.unionRelX[index] ?? 0;
    union.width = unionContentWidth(union);
  });
  unit.width = Math.max(layout.width, CARD_W);
  return unit.width;
}

function placeUnit(unit: TreeUnit, x: number) {
  unit.x = x;
  unit.topX = x + (unit.memberRelX[0] ?? 0);
  for (const union of unit.unions) {
    let cursor = x + union.relX;
    for (const child of union.children) {
      placeUnit(child, cursor);
      cursor += child.width + HOUSE_GAP;
    }
  }
}

function resolveHousehold(unit: TreeUnit): { memberRelX: number[]; unionRelX: number[]; width: number } {
  const count = unit.members.length;
  const gaps = Array.from({ length: Math.max(0, count - 1) }, () => COUPLE_GAP);
  const unionWidths = unit.unions.map((union) => unionContentWidth(union));
  const indexOf = (id: string) => unit.members.findIndex((person) => person.id === id);

  const centersFor = () => {
    const centers: number[] = [];
    let cursor = 0;
    for (let index = 0; index < count; index += 1) {
      centers.push(cursor + CARD_W / 2);
      if (index < gaps.length) cursor += CARD_W + gaps[index];
    }
    return centers;
  };

  const junctionX = (parentIds: string[], centers: number[]) => {
    const xs = parentIds.map((id) => centers[indexOf(id)]).filter((value) => Number.isFinite(value));
    if (!xs.length) return centers[0] ?? CARD_W / 2;
    return (Math.min(...xs) + Math.max(...xs)) / 2;
  };

  for (let pass = 0; pass < 16; pass += 1) {
    const centers = centersFor();
    const blocks = unit.unions
      .map((union, index) => {
        const width = unionWidths[index];
        if (!union.children.length || width <= 0) return null;
        const junction = junctionX(union.parentIds, centers);
        return {
          left: junction - width / 2,
          right: junction + width / 2,
          start: Math.min(...union.parentIds.map(indexOf)),
          end: Math.max(...union.parentIds.map(indexOf)),
        };
      })
      .filter((block): block is { left: number; right: number; start: number; end: number } => Boolean(block));
    let grew = false;
    for (let index = 0; index < blocks.length - 1; index += 1) {
      const overlap = blocks[index].right + HOUSE_GAP - blocks[index + 1].left;
      if (overlap <= 0.5) continue;
      let gapStart = Math.min(blocks[index].end, blocks[index + 1].start);
      let gapEnd = Math.max(blocks[index].end, blocks[index + 1].start);
      if (gapStart === gapEnd) {
        gapStart = Math.min(blocks[index].start, gapStart);
        gapEnd = Math.max(blocks[index + 1].end, gapEnd);
      }
      for (let gap = gapStart; gap < gapEnd && gap < gaps.length; gap += 1) gaps[gap] += overlap;
      grew = true;
      break;
    }
    if (!grew) break;
  }

  const centers = centersFor();
  const memberRelX = centers.map((center) => center - CARD_W / 2);
  const unionRelX = unit.unions.map((union, index) => junctionX(union.parentIds, centers) - unionWidths[index] / 2);
  let minX = Math.min(...memberRelX, ...unionRelX);
  let maxX = Math.max(...memberRelX.map((value) => value + CARD_W), ...unionRelX.map((value, index) => value + unionWidths[index]));
  if (!Number.isFinite(minX)) minX = 0;
  if (!Number.isFinite(maxX)) maxX = CARD_W;
  const shift = -Math.min(0, minX);
  return {
    memberRelX: memberRelX.map((value) => value + shift),
    unionRelX: unionRelX.map((value) => value + shift),
    width: maxX + shift,
  };
}

function assignGenerations(people: Person[]): Map<string, number> {
  const byId = indexPeople(people);
  const generation = new Map<string, number>();

  function depth(id: string, stack: Set<string>): number {
    if (stack.has(id)) return generation.get(id) ?? 0;
    const person = byId.get(id);
    if (!person) return 0;
    const parents = person.parentIds.filter((parentId) => byId.has(parentId));
    if (!parents.length) {
      generation.set(id, 0);
      return 0;
    }
    const cached = generation.get(id);
    if (cached !== undefined) return cached;
    stack.add(id);
    const value = 1 + Math.max(...parents.map((parentId) => depth(parentId, stack)));
    stack.delete(id);
    generation.set(id, value);
    return value;
  }

  for (const person of people) depth(person.id, new Set());

  for (let pass = 0; pass < people.length; pass += 1) {
    let changed = false;
    for (const person of people) {
      const parents = person.parentIds.filter((id) => byId.has(id));
      if (parents.length) {
        const next = 1 + Math.max(...parents.map((id) => generation.get(id) ?? 0));
        if (next !== generation.get(person.id)) {
          generation.set(person.id, next);
          changed = true;
        }
        continue;
      }
      const spouseGens = person.spouseIds
        .filter((id) => byId.has(id))
        .map((id) => generation.get(id) ?? 0);
      if (!spouseGens.length) continue;
      const next = Math.max(...spouseGens);
      if (next > (generation.get(person.id) ?? 0)) {
        generation.set(person.id, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return generation;
}

function unitWidth(count: number): number {
  if (count <= 0) return 0;
  return count * CARD_W + (count - 1) * COUPLE_GAP;
}

function clusterParents(parents: Person[]): Person[][] {
  const byId = new Map(parents.map((person) => [person.id, person]));
  const unused = new Set(parents.map((person) => person.id));
  const groups: Person[][] = [];
  for (const person of [...parents].sort((a, b) => (a.birthYear ?? 99999) - (b.birthYear ?? 99999))) {
    if (!unused.has(person.id)) continue;
    unused.delete(person.id);
    const spouse = person.spouseIds.map((id) => byId.get(id)).find((item) => item && unused.has(item.id));
    if (spouse) {
      unused.delete(spouse.id);
      groups.push(person.gender === "female" && spouse.gender === "male" ? [spouse, person] : [person, spouse]);
    } else {
      groups.push([person]);
    }
  }
  return groups;
}

function junctionIdsForHousehold(household: Household): string[] {
  const spouseIds = new Set(household.spouses.map((spouse) => spouse.id));
  const others = new Set<string>();
  for (const child of household.children) {
    for (const parentId of child.person.parentIds) {
      if (parentId !== household.anchor.id && spouseIds.has(parentId)) others.add(parentId);
    }
  }
  if (others.size === 1) return [household.anchor.id, [...others][0]];
  if (household.spouses.length === 1 && others.size === 0) return [household.anchor.id];
  return [household.anchor.id, ...household.spouses.map((spouse) => spouse.id)];
}

function addSpouseLinks(
  ids: string[],
  pos: Map<string, LayoutNode>,
  edges: LayoutEdge[],
  personName: (id: string) => string,
) {
  for (let index = 0; index < ids.length - 1; index += 1) {
    const a = ids[index];
    const b = ids[index + 1];
    const left = pos.get(a);
    const right = pos.get(b);
    if (!left || !right) continue;
    const x1 = left.x + CARD_W / 2;
    const x2 = right.x + CARD_W / 2;
    const bottom = left.y + CARD_H;
    const bar = bottom + SPOUSE_DROP;
    const [first, second] = [a, b].sort();
    const id = `spouse:${first}:${second}`;
    if (edges.some((edge) => edge.id === id)) continue;
    edges.push({
      id,
      kind: "spouse",
      title: `${personName(a)} and ${personName(b)}, spouses`,
      d: `M ${x1} ${bottom} L ${x1} ${bar} L ${x2} ${bar} L ${x2} ${bottom}`,
      d2: `M ${x1} ${bar - 6} L ${x2} ${bar - 6}`,
      childId: null,
      matches: [{ a, b }],
    });
  }
}

function coupleJunction(ids: string[], pos: Map<string, LayoutNode>): { x: number; y: number } | null {
  const nodes = ids.map((id) => pos.get(id)).filter((node): node is LayoutNode => Boolean(node));
  if (!nodes.length) return null;
  if (nodes.length === 1) {
    return { x: nodes[0].x + CARD_W / 2, y: nodes[0].y + CARD_H };
  }
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  return {
    x: (first.x + CARD_W / 2 + last.x + CARD_W / 2) / 2,
    y: first.y + CARD_H + SPOUSE_DROP,
  };
}

function stem(fromX: number, fromY: number, toX: number, toY: number, busY: number): string {
  const bus = Math.min(busY, toY - 24);
  const mid = Math.max(fromY + 12, bus);
  return `M ${Math.round(fromX)} ${Math.round(fromY)} L ${Math.round(fromX)} ${Math.round(mid)} L ${Math.round(toX)} ${Math.round(mid)} L ${Math.round(toX)} ${Math.round(toY)}`;
}
