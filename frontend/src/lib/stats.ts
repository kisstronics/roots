import type { Person } from "../types";
import { yearFromDate } from "./people";

export interface AgeStat {
  label: string;
  hint: string;
  total: number;
  living: number;
  males: number;
  malesLiving: number;
  females: number;
  femalesLiving: number;
}

function emptyRow(label: string, hint: string): AgeStat {
  return { label, hint, total: 0, living: 0, males: 0, malesLiving: 0, females: 0, femalesLiving: 0 };
}

export function familyStats(people: Person[], today = new Date()): { rows: AgeStat[]; unknown: number } {
  const rows: AgeStat[] = [
    emptyRow("Total", ""),
    emptyRow("Adults", "18 and older"),
    emptyRow("Teenagers", "12–17"),
    emptyRow("Kids", "Under 12"),
  ];
  let unknown = 0;
  for (const person of people) {
    count(rows[0], person);
    const age = ageOf(person, today);
    if (age == null || age < 0) {
      unknown += 1;
      continue;
    }
    if (age >= 18) count(rows[1], person);
    else if (age >= 12) count(rows[2], person);
    else count(rows[3], person);
  }
  return { rows, unknown };
}

export function ageOf(person: Person, today = new Date()): number | null {
  const birthYear = person.birthYear ?? yearFromDate(person.birthday);
  if (birthYear == null) return null;
  if (person.birthday && (person.living || person.deathday)) {
    const end = person.living ? isoDate(today) : person.deathday;
    return end ? yearsBetween(person.birthday, end) : null;
  }
  const endYear = person.living ? today.getFullYear() : (person.deathYear ?? yearFromDate(person.deathday));
  if (endYear == null) return null;
  return endYear - birthYear;
}

function count(row: AgeStat, person: Pick<Person, "gender" | "living">) {
  row.total += 1;
  if (person.living) row.living += 1;
  if (person.gender === "female") {
    row.females += 1;
    if (person.living) row.femalesLiving += 1;
  } else {
    row.males += 1;
    if (person.living) row.malesLiving += 1;
  }
}

function yearsBetween(start: string, end: string): number | null {
  const born = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start);
  const later = /^(\d{4})-(\d{2})-(\d{2})$/.exec(end);
  if (!born || !later) return null;
  let age = Number(later[1]) - Number(born[1]);
  if (later[2] < born[2] || (later[2] === born[2] && later[3] < born[3])) age -= 1;
  return age;
}

function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
