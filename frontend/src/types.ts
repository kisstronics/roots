export type Gender = "male" | "female";

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  living: boolean;
  birthYear: number | null;
  deathYear: number | null;
  birthday: string | null;
  deathday: string | null;
  birthLocation: string;
  currentLocation: string;
  notes: string;
  parentIds: string[];
  spouseIds: string[];
  siblingIds: string[];
  photo: string | null;
}

export interface Family {
  slug: string;
  name: string;
  people: Person[];
  updatedAt: string;
}

export interface FamilySummary {
  slug: string;
  name: string;
  people: number;
  generations: number;
  shareToken?: string | null;
  publicTree?: boolean;
}

export type RelationKind =
  | "spouse"
  | "son"
  | "daughter"
  | "brother"
  | "sister"
  | "father"
  | "mother";

export interface NewPersonInput {
  firstName: string;
  lastName: string;
  gender: Gender;
  living: boolean;
  birthYear: number | null;
  deathYear: number | null;
  birthday: string | null;
  deathday: string | null;
  birthLocation: string;
  currentLocation: string;
  notes: string;
  otherParentId: string | null;
  photo: string | null;
}
