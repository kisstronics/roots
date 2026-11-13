import type { Person } from "../types";
import type { LayoutEdge } from "./layout";
import { fullName, indexPeople, siblingsOf, childrenOf } from "./people";

export type StepKind =
  | "father"
  | "mother"
  | "son"
  | "daughter"
  | "husband"
  | "wife"
  | "brother"
  | "sister";

export interface Step {
  fromId: string;
  toId: string;
  kind: StepKind;
}

export interface TraceView {
  summary: string;
  lines: string[];
  steps: Step[];
  highlightIds: string[];
}

export function tracePath(people: Person[], fromId: string, toId: string): Step[] {
  if (fromId === toId) return [];
  const byId = indexPeople(people);
  if (!byId.has(fromId) || !byId.has(toId)) return [];

  const queue = [fromId];
  const prev = new Map<string, Step>();
  const seen = new Set<string>([fromId]);

  while (queue.length) {
    const id = queue.shift();
    if (!id) break;
    const person = byId.get(id);
    if (!person) continue;
    for (const next of neighbors(person, people, byId)) {
      if (seen.has(next.id)) continue;
      seen.add(next.id);
      prev.set(next.id, { fromId: id, toId: next.id, kind: next.kind });
      if (next.id === toId) return rebuild(prev, fromId, toId);
      queue.push(next.id);
    }
  }

  return [];
}

export function tracePeople(people: Person[], focusId: string, personId: string): TraceView {
  const steps = tracePath(people, focusId, personId);
  if (focusId === personId) {
    return {
      summary: "This person is the center of the three-generation view.",
      lines: [],
      steps: [],
      highlightIds: [focusId],
    };
  }
  if (!steps.length) {
    return {
      summary: "No connection is recorded between these two people yet.",
      lines: [],
      steps: [],
      highlightIds: [focusId, personId],
    };
  }
  return viewFromSteps(people, steps);
}

export function traceEdge(people: Person[], focusId: string, edge: LayoutEdge): TraceView {
  const byId = indexPeople(people);
  if (edge.kind === "spouse") {
    const match = edge.matches[0];
    if (!match) return tracePeople(people, focusId, focusId);
    const pathA = tracePath(people, focusId, match.a);
    const pathB = tracePath(people, focusId, match.b);
    const steps = pathEndingWithLink(pathA, pathB, match.a, match.b, byId);
    return viewFromSteps(people, steps);
  }

  const childId = edge.childId;
  if (!childId) return tracePeople(people, focusId, focusId);
  const parentIds = [
    ...new Set(edge.matches.map((match) => (match.a === childId ? match.b : match.a)).filter((id) => id !== childId)),
  ];

  if (childId === focusId) {
    const steps: Step[] = parentIds.flatMap((parentId) => {
      const parent = byId.get(parentId);
      if (!parent) return [];
      const kind: StepKind = parent.gender === "male" ? "father" : "mother";
      return [{ fromId: focusId, toId: parentId, kind }];
    });
    if (steps.length <= 1) return viewFromSteps(people, steps);
    const lines = steps.map((step) => {
      const parent = byId.get(step.toId);
      const child = byId.get(step.fromId);
      if (!parent || !child) return "";
      return `${fullName(parent)} is the ${step.kind} of ${fullName(child)}.`;
    }).filter(Boolean);
    return {
      summary: lines.join(" "),
      lines,
      steps,
      highlightIds: [focusId, ...parentIds],
    };
  }

  return viewFromSteps(people, tracePath(people, focusId, childId));
}

export function pairKey(a: string, b: string): string {
  return [a, b].sort().join("::");
}

function viewFromSteps(people: Person[], steps: Step[]): TraceView {
  const byId = indexPeople(people);
  const lines = steps.map((step) => sentence(step, byId)).filter(Boolean);
  const highlightIds = unique(steps.flatMap((step) => [step.fromId, step.toId]));
  return {
    summary: summarize(steps, byId) || lines[0] || "Connection",
    lines,
    steps,
    highlightIds,
  };
}

function pathEndingWithLink(
  pathA: Step[],
  pathB: Step[],
  a: string,
  b: string,
  byId: Map<string, Person>,
): Step[] {
  const lastA = pathA[pathA.length - 1];
  const lastB = pathB[pathB.length - 1];
  if (lastB && lastB.fromId === a && lastB.toId === b) return pathB;
  if (lastA && lastA.fromId === b && lastA.toId === a) return pathA;

  const base = pathA.length <= pathB.length ? pathA : pathB;
  const endId = base.length ? base[base.length - 1].toId : pathA.length === 0 && pathB.length === 0 ? a : a;
  const from = base.length ? endId : a;
  const to = from === a ? b : a;
  const other = byId.get(to);
  if (!other) return base;
  const kind: StepKind = other.gender === "male" ? "husband" : "wife";
  if (base.some((step) => step.fromId === from && step.toId === to)) return base;
  return [...base, { fromId: from, toId: to, kind }];
}

function sentence(step: Step, byId: Map<string, Person>): string {
  const from = byId.get(step.fromId);
  const to = byId.get(step.toId);
  if (!from || !to) return "";
  return `${fullName(to)} is the ${step.kind} of ${fullName(from)}.`;
}

function summarize(steps: Step[], byId: Map<string, Person>): string {
  if (!steps.length) return "";
  const focus = byId.get(steps[0].fromId);
  const target = byId.get(steps[steps.length - 1].toId);
  if (!focus || !target) return "";
  const kinds = steps.map((step) => step.kind);
  const parentish = (kind: StepKind) => kind === "father" || kind === "mother";
  const childish = (kind: StepKind) => kind === "son" || kind === "daughter";

  if (kinds.length === 1) return `${fullName(target)} is the ${kinds[0]} of ${fullName(focus)}.`;

  if (kinds.every(parentish)) {
    const side = kinds.length === 2 ? (kinds[0] === "father" ? "paternal" : "maternal") : "";
    const word = ancestorWord(kinds.length, target.gender);
    return `${fullName(target)} is ${fullName(focus)}'s ${side ? `${side} ` : ""}${word}.`;
  }

  if (kinds.every(childish)) {
    return `${fullName(target)} is ${fullName(focus)}'s ${descendantWord(kinds.length, target.gender)}.`;
  }

  if (kinds.length === 2 && parentish(kinds[0]) && (kinds[1] === "brother" || kinds[1] === "sister")) {
    return `${fullName(target)} is ${fullName(focus)}'s ${target.gender === "male" ? "uncle" : "aunt"}.`;
  }

  if (kinds.length === 2 && (kinds[0] === "brother" || kinds[0] === "sister") && childish(kinds[1])) {
    return `${fullName(target)} is ${fullName(focus)}'s ${target.gender === "male" ? "nephew" : "niece"}.`;
  }

  if (
    kinds.length === 3 &&
    parentish(kinds[0]) &&
    (kinds[1] === "brother" || kinds[1] === "sister") &&
    childish(kinds[2])
  ) {
    return `${fullName(target)} is ${fullName(focus)}'s cousin.`;
  }

  if (kinds.length === 2 && childish(kinds[0]) && (kinds[1] === "husband" || kinds[1] === "wife")) {
    return `${fullName(target)} is ${fullName(focus)}'s ${target.gender === "male" ? "son-in-law" : "daughter-in-law"}.`;
  }

  if (
    kinds.length === 2 &&
    (kinds[0] === "brother" || kinds[0] === "sister") &&
    (kinds[1] === "husband" || kinds[1] === "wife")
  ) {
    return `${fullName(target)} is ${fullName(focus)}'s ${target.gender === "male" ? "brother-in-law" : "sister-in-law"}.`;
  }

  return "";
}

function ancestorWord(steps: number, gender: Person["gender"]): string {
  if (steps <= 1) return gender === "male" ? "father" : "mother";
  return `${"great-".repeat(steps - 2)}${gender === "male" ? "grandfather" : "grandmother"}`;
}

function descendantWord(steps: number, gender: Person["gender"]): string {
  if (steps <= 1) return gender === "male" ? "son" : "daughter";
  return `${"great-".repeat(steps - 2)}${gender === "male" ? "grandson" : "granddaughter"}`;
}

function neighbors(
  person: Person,
  people: Person[],
  byId: Map<string, Person>,
): { id: string; kind: StepKind }[] {
  const out: { id: string; kind: StepKind }[] = [];
  for (const parentId of person.parentIds) {
    const parent = byId.get(parentId);
    if (!parent) continue;
    out.push({ id: parentId, kind: parent.gender === "male" ? "father" : "mother" });
  }
  for (const child of childrenOf(person, people)) {
    out.push({ id: child.id, kind: child.gender === "male" ? "son" : "daughter" });
  }
  for (const sibling of siblingsOf(person, people)) {
    out.push({ id: sibling.id, kind: sibling.gender === "male" ? "brother" : "sister" });
  }
  for (const spouseId of person.spouseIds) {
    const spouse = byId.get(spouseId);
    if (!spouse) continue;
    out.push({ id: spouseId, kind: spouse.gender === "male" ? "husband" : "wife" });
  }
  return out;
}

function rebuild(prev: Map<string, Step>, fromId: string, toId: string): Step[] {
  const steps: Step[] = [];
  let cursor: string | undefined = toId;
  while (cursor && cursor !== fromId) {
    const step = prev.get(cursor);
    if (!step) break;
    steps.push(step);
    cursor = step.fromId;
  }
  steps.reverse();
  return steps;
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}
