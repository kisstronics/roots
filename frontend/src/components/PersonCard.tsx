import type { Person } from "../types";
import { CARD_H, CARD_W } from "../lib/layout";
import { fullName, initials, lifeYears } from "../lib/people";

interface PersonCardProps {
  person: Person;
  x: number;
  y: number;
  selected: boolean;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
}

export function PersonCard({ person, x, y, selected, onSelect, onOpen }: PersonCardProps) {
  const name = fullName(person);
  return (
    <article
      className={["person-card", person.gender, selected ? "is-selected" : ""].filter(Boolean).join(" ")}
      style={{ left: x, top: y, width: CARD_W, height: CARD_H }}
      data-testid="person-card"
      data-person-id={person.id}
      data-interactive="true"
      title={`${name}, ${lifeYears(person)}`}
    >
      <button
        type="button"
        className="person-main"
        onClick={() => onSelect(person.id)}
        onDoubleClick={() => onOpen(person.id)}
      >
        {person.photo ? (
          <img className="card-photo" src={person.photo} alt="" data-testid="person-photo" />
        ) : (
          <span className={`card-photo avatar ${person.gender}`}>{initials(person)}</span>
        )}
        <span className="card-meta">
          <span className="person-name">{name}</span>
          <span className="person-years">{lifeYears(person)}</span>
        </span>
      </button>
    </article>
  );
}
