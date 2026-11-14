import { useEffect } from "react";
import type { Person } from "../types";
import { ageOf } from "../lib/stats";
import { childrenOf, formatDate, fullName, initials, lifeYears, parentsOf, siblingsOf, spousesOf } from "../lib/people";

interface PersonDetailsDialogProps {
  person: Person;
  people: Person[];
  onClose: () => void;
  onOpen: (id: string) => void;
}

export function PersonDetailsDialog({ person, people, onClose, onOpen }: PersonDetailsDialogProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const parents = parentsOf(person, people);
  const spouses = spousesOf(person, people);
  const children = childrenOf(person, people);
  const siblings = siblingsOf(person, people);
  const age = ageOf(person);

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div
        className="modal person-details"
        role="dialog"
        aria-modal="true"
        aria-labelledby="person-details-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="detail-columns">
          <div className="detail-identity">
            <p className="eyebrow">
              {person.gender === "male" ? "Male" : "Female"}
              <span aria-hidden="true"> · </span>
              {person.living ? "Living" : "Deceased"}
            </p>
            <span className={["profile-portrait", person.gender, person.living ? "is-living" : "is-deceased"].join(" ")}>
              {person.photo ? (
                <img src={person.photo} alt="" />
              ) : (
                <span className={`avatar ${person.gender}`}>{initials(person)}</span>
              )}
            </span>
            <h2 id="person-details-title">{fullName(person)}</h2>
            <p className="person-years detail-years">{lifeYears(person)}</p>
          </div>
          <div className="detail-facts">
            <dl className="detail-grid">
              <dt>Age</dt>
              <dd>{age == null || age < 0 ? "Not recorded" : `${age} years`}</dd>
              <dt>Birthday</dt>
              <dd>{shownDate(person.birthday, person.birthYear)}</dd>
              {!person.living && (
                <>
                  <dt>Death day</dt>
                  <dd>{shownDate(person.deathday, person.deathYear)}</dd>
                </>
              )}
              <dt>Birth location</dt>
              <dd>{shownText(person.birthLocation)}</dd>
              <dt>Current location</dt>
              <dd>{shownText(person.currentLocation)}</dd>
              <dt>Notes</dt>
              <dd className="detail-notes">{shownText(person.notes)}</dd>
            </dl>
            <div className="detail-relations-grid">
              <RelationList label="Parents" people={parents} onOpen={onOpen} />
              <RelationList label="Spouses" people={spouses} onOpen={onOpen} />
              <RelationList label="Children" people={children} onOpen={onOpen} />
              <RelationList label="Siblings" people={siblings} onOpen={onOpen} />
            </div>
          </div>
        </div>
        <div className="inline-actions">
          <button type="button" className="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function RelationList({ label, people, onOpen }: { label: string; people: Person[]; onOpen: (id: string) => void }) {
  return (
    <div className="detail-relations">
      <h3>{label}</h3>
      {people.length ? (
        <div className="detail-links">
          {people.map((person) => (
            <button key={person.id} type="button" onClick={() => onOpen(person.id)}>
              {fullName(person)}
            </button>
          ))}
        </div>
      ) : (
        <p className="hint">None recorded</p>
      )}
    </div>
  );
}

function shownDate(date: string | null, year: number | null): string {
  if (date) return formatDate(date);
  if (year) return String(year);
  return "Not recorded";
}

function shownText(value: string): string {
  const text = value.trim();
  return text || "Not recorded";
}
