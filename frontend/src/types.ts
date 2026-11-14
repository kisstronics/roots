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

export type FamilyRole = "owner" | "editor" | "viewer";

export interface FamilyMember {
  userId: string;
  email: string;
  name: string;
  role: "editor" | "viewer";
  pending?: boolean;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface AccessEvent {
  id: string;
  name: string;
  email: string;
  action: string;
  targetEmail: string;
  role: string;
  createdAt: string;
}

export interface ShareLink {
  id: string;
  token: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface FamilyEdit {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface FamilySummary {
  slug: string;
  name: string;
  people: number;
  generations: number;
  shareToken?: string | null;
  role?: FamilyRole;
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
