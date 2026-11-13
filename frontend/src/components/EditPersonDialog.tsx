import { useState } from "react";
import type { Gender, NewPersonInput, Person } from "../types";
import { fullName, yearFromDate } from "../lib/people";
import { LivingSwitch } from "./LivingSwitch";
import { PhotoField } from "./PhotoField";

interface EditPersonDialogProps {
  person: Person;
  onCancel: () => void;
  onSubmit: (input: NewPersonInput) => string | null;
}

export function EditPersonDialog({ person, onCancel, onSubmit }: EditPersonDialogProps) {
  const [tab, setTab] = useState<"basics" | "more">("basics");
  const [firstName, setFirstName] = useState(person.firstName);
  const [lastName, setLastName] = useState(person.lastName);
  const [gender, setGender] = useState<Gender>(person.gender);
  const [living, setLiving] = useState(person.living);
  const [photo, setPhoto] = useState<string | null>(person.photo);
  const [birthLocation, setBirthLocation] = useState(person.birthLocation);
  const [currentLocation, setCurrentLocation] = useState(person.currentLocation);
  const [birthday, setBirthday] = useState(person.birthday ?? "");
  const [deathday, setDeathday] = useState(person.deathday ?? "");
  const [notes, setNotes] = useState(person.notes);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="backdrop" onMouseDown={onCancel}>
      <form
        className="modal"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const message = onSubmit(buildInput());
            setError(message);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Could not save those details.");
          }
        }}
      >
        <p className="eyebrow">Edit details</p>
        <h2>{fullName(person)}</h2>
        <div className="modal-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "basics"} onClick={() => setTab("basics")}>
            Details
          </button>
          <button type="button" role="tab" aria-selected={tab === "more"} onClick={() => setTab("more")}>
            More details
          </button>
        </div>
        {tab === "basics" ? (
          <>
            <label>
              First name
              <input autoFocus value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
            </label>
            <label>
              Last name
              <input value={lastName} onChange={(event) => setLastName(event.target.value)} required />
            </label>
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
            <LivingSwitch
              living={living}
              onChange={(next) => {
                setLiving(next);
                if (next) setDeathday("");
              }}
            />
            <PhotoField photo={photo} onChange={setPhoto} />
          </>
        ) : (
          <>
            <label>
              Birth location
              <input value={birthLocation} maxLength={120} onChange={(event) => setBirthLocation(event.target.value)} />
            </label>
            <label>
              Current location
              <input
                value={currentLocation}
                maxLength={120}
                onChange={(event) => setCurrentLocation(event.target.value)}
              />
            </label>
            <label>
              Birthday
              <input type="date" value={birthday} onChange={(event) => setBirthday(event.target.value)} />
            </label>
            {!living && (
              <label>
                Death day
                <input type="date" value={deathday} onChange={(event) => setDeathday(event.target.value)} />
              </label>
            )}
            <label>
              Notes
              <textarea
                value={notes}
                maxLength={500}
                rows={4}
                placeholder="Comments about this person"
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
            <p className="hint">{notes.length}/500</p>
          </>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="button primary">
            Save details
          </button>
        </div>
      </form>
    </div>
  );

  function buildInput(): NewPersonInput {
    const nextBirthday = birthday || null;
    const nextDeathday = living ? null : deathday || null;
    if (notes.trim().length > 500) throw new Error("Notes can be at most 500 characters.");
    if (nextBirthday && nextDeathday && nextDeathday < nextBirthday) {
      throw new Error("Death day cannot be earlier than the birthday.");
    }
    return {
      firstName,
      lastName,
      gender,
      living,
      birthday: nextBirthday,
      deathday: nextDeathday,
      birthYear: yearFromDate(nextBirthday) ?? person.birthYear,
      deathYear: living ? null : yearFromDate(nextDeathday) ?? person.deathYear,
      birthLocation,
      currentLocation,
      notes,
      otherParentId: null,
      photo,
    };
  }
}
