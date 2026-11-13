import { useEffect } from "react";
import type { Person } from "../types";
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

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div
        className="modal person-details"
        role="dialog"
        aria-modal="true"
        aria-labelledby="person-details-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="detail-body">
          <p className="eyebrow">
            {person.gender === "male" ? "Male" : "Female"}
            <span aria-hidden="true"> · </span>
            {person.living ? "Living" : "Deceased"}
          </p>
          {person.photo ? (
            <img className="portrait" src={person.photo} alt="" />
          ) : (
            <span className={`avatar detail-avatar ${person.gender}`}>{initials(person)}</span>
          )}
          <h2 id="person-details-title">{fullName(person)}</h2>
          <p className="person-years detail-years">{lifeYears(person)}</p>
          <dl className="detail-grid">
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
          <RelationList label="Parents" people={parents} onOpen={onOpen} />
          <RelationList label="Spouses" people={spouses} onOpen={onOpen} />
          <RelationList label="Children" people={children} onOpen={onOpen} />
          <RelationList label="Siblings" people={siblings} onOpen={onOpen} />
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
