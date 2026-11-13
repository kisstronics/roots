import { useState } from "react";
import type { Gender, NewPersonInput, Person, RelationKind } from "../types";
import { fullName } from "../lib/people";
import { LivingSwitch } from "./LivingSwitch";
import { PhotoField } from "./PhotoField";

interface AddPersonDialogProps {
  kind: RelationKind | "root";
  selected: Person | null;
  spouses: Person[];
  defaultLastName: string;
  onCancel: () => void;
  onSubmit: (input: NewPersonInput) => string | null;
}

const TITLES: Record<RelationKind | "root", string> = {
  root: "Add the first person",
  spouse: "Add a spouse",
  son: "Add a son",
  daughter: "Add a daughter",
  brother: "Add a brother",
  sister: "Add a sister",
  father: "Add a father",
  mother: "Add a mother",
};

export function AddPersonDialog({
  kind,
  selected,
  spouses,
  defaultLastName,
  onCancel,
  onSubmit,
}: AddPersonDialogProps) {
  const lockedGender = genderLock(kind);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState(defaultLastName);
  const [gender, setGender] = useState<Gender>(lockedGender ?? (selected?.gender === "male" ? "female" : "male"));
  const [living, setLiving] = useState(true);
  const [photo, setPhoto] = useState<string | null>(null);
  const [includeOther, setIncludeOther] = useState(true);
  const [otherParentId, setOtherParentId] = useState(spouses[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="backdrop" onMouseDown={onCancel}>
      <form
        className="modal"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const message = onSubmit({
              firstName,
              lastName,
              gender: lockedGender ?? gender,
              living,
              birthYear: null,
              deathYear: null,
              birthday: null,
              deathday: null,
              birthLocation: "",
              currentLocation: "",
              notes: "",
              otherParentId: otherParent(kind, spouses, includeOther, otherParentId),
              photo,
            });
            setError(message);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Could not add that person.");
          }
        }}
      >
        <p className="eyebrow">New family member</p>
        <h2>{TITLES[kind]}</h2>
        {selected && <p className="hint">This person is added to {fullName(selected)}.</p>}
        <label>
          First name
          <input autoFocus value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
        </label>
        <label>
          Last name
          <input value={lastName} onChange={(event) => setLastName(event.target.value)} required />
        </label>
        {lockedGender ? (
          <p className="hint">Saved as {lockedGender}.</p>
        ) : (
          <fieldset className="gender-choice">
            <legend>Gender</legend>
            <label>
              <input type="radio" name="gender" checked={gender === "male"} onChange={() => setGender("male")} />
              Male
            </label>
            <label>
              <input type="radio" name="gender" checked={gender === "female"} onChange={() => setGender("female")} />
              Female
            </label>
          </fieldset>
        )}
        <LivingSwitch living={living} onChange={setLiving} />
        {(kind === "son" || kind === "daughter") && selected && (
          spouses.length === 0 ? (
            <p className="hint">
              Only {fullName(selected)} will be listed as a parent. Add a spouse first if both parents should be on the tree.
            </p>
          ) : spouses.length === 1 ? (
            <label className="check">
              <input type="checkbox" checked={includeOther} onChange={(event) => setIncludeOther(event.target.checked)} />
              Also list {fullName(spouses[0])} as a parent
            </label>
          ) : (
            <label>
              Other parent
              <select value={otherParentId} onChange={(event) => setOtherParentId(event.target.value)}>
                <option value="">Only {fullName(selected)}</option>
                {spouses.map((spouse) => (
                  <option key={spouse.id} value={spouse.id}>
                    {fullName(spouse)}
                  </option>
                ))}
              </select>
            </label>
          )
        )}
        {(kind === "brother" || kind === "sister") && (
          <p className="hint">They share the same parents. If no parents are recorded yet, they are linked as siblings.</p>
        )}
        <PhotoField photo={photo} onChange={setPhoto} />
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="button primary">
            {TITLES[kind].replace("Add ", "Save ")}
          </button>
        </div>
      </form>
    </div>
  );
}

function genderLock(kind: RelationKind | "root"): Gender | null {
  if (kind === "son" || kind === "brother" || kind === "father") return "male";
  if (kind === "daughter" || kind === "sister" || kind === "mother") return "female";
  return null;
}

function otherParent(
  kind: RelationKind | "root",
  spouses: Person[],
  includeOther: boolean,
  otherParentId: string,
): string | null {
  if (kind !== "son" && kind !== "daughter") return null;
  if (spouses.length === 1) return includeOther ? spouses[0].id : null;
  if (spouses.length > 1) return otherParentId || null;
  return null;
}
