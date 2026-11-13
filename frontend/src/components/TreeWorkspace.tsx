import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Family, NewPersonInput, RelationKind } from "../types";
import { addRelative, createPerson, removePerson, updatePerson } from "../lib/edit";
import { fullName, parentOfGender, spousesOf } from "../lib/people";
import { familyStats } from "../lib/stats";
import { AddPersonDialog } from "./AddPersonDialog";
import { EditPersonDialog } from "./EditPersonDialog";
import { PersonDetailsDialog } from "./PersonDetailsDialog";
import { TreeCanvas } from "./TreeCanvas";

const ADD_OPTIONS: { kind: RelationKind; label: string }[] = [
  { kind: "spouse", label: "Spouse" },
  { kind: "son", label: "Son" },
  { kind: "daughter", label: "Daughter" },
  { kind: "brother", label: "Brother" },
  { kind: "sister", label: "Sister" },
  { kind: "father", label: "Father" },
  { kind: "mother", label: "Mother" },
];

interface TreeWorkspaceProps {
  family: Family;
  mode: "view" | "edit";
  onChange?: (family: Family) => void;
  toolbarExtra?: ReactNode;
}

export function TreeWorkspace({ family, mode, onChange, toolbarExtra }: TreeWorkspaceProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revealId, setRevealId] = useState<string | null>(null);
  const [revealNonce, setRevealNonce] = useState(0);
  const [dialog, setDialog] = useState<RelationKind | "root" | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);
  const stats = useMemo(() => familyStats(family.people), [family.people]);

  useEffect(() => {
    if (!statsOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!statsRef.current?.contains(event.target as Node)) setStatsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStatsOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [statsOpen]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    setConfirming(false);
    setEditing(false);
  }, [selectedId]);

  useEffect(() => {
    if (selectedId && !family.people.some((person) => person.id === selectedId)) {
      setSelectedId(null);
      setDetailsOpen(false);
    }
  }, [family.people, selectedId]);

  const selected = family.people.find((person) => person.id === selectedId) ?? null;
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("en-US");
    if (!needle) return [];
    return family.people.filter((person) => fullName(person).toLocaleLowerCase("en-US").includes(needle)).slice(0, 8);
  }, [family.people, query]);
  if (!family.people.length) {
    return (
      <section className="empty-tree">
        <p className="eyebrow">{family.name}</p>
        <h1>This family has no people yet.</h1>
        {mode === "edit" ? (
          <button type="button" className="button primary" onClick={() => setDialog("root")}>
            Add the first person
          </button>
        ) : (
          <p>People can be added from the family editor.</p>
        )}
        {dialog === "root" && (
          <AddPersonDialog
            kind="root"
            selected={null}
            spouses={[]}
            defaultLastName={family.name}
            onCancel={() => setDialog(null)}
            onSubmit={submitNew}
          />
        )}
      </section>
    );
  }

  function selectPerson(id: string) {
    setSelectedId(id);
  }

  function openPerson(id: string) {
    setSelectedId(id);
    setDetailsOpen(true);
  }

  function focusPerson(id: string) {
    setSelectedId(id);
    setRevealId(id);
    setRevealNonce((value) => value + 1);
  }

  function submitNew(input: NewPersonInput): string | null {
    if (!onChange) return "This tree is view only.";
    try {
      if (dialog === "root") {
        const person = createPerson(input);
        onChange({ ...family, people: [...family.people, person], updatedAt: new Date().toISOString() });
        setDialog(null);
        setSelectedId(person.id);
        setToast(`Added ${fullName(person)}.`);
        return null;
      }
      if (!dialog || !selectedId) return "Select a person first.";
      const result = addRelative(family, selectedId, dialog, input);
      onChange(result.family);
      setDialog(null);
      setSelectedId(result.person.id);
      setToast(`Added ${fullName(result.person)}.`);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Could not add that person.";
    }
  }

  function submitEdit(input: NewPersonInput): string | null {
    if (!onChange || !selected) return "Select a person first.";
    try {
      onChange(updatePerson(family, selected.id, input));
      setEditing(false);
      setToast("Details saved.");
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Could not save those details.";
    }
  }

  function removeSelected() {
    if (!onChange || !selected) return;
    const removedName = fullName(selected);
    onChange(removePerson(family, selected.id));
    setSelectedId(null);
    setToast(`${removedName} was removed.`);
  }

  return (
    <section className="workspace">
      <div className="tree-toolbar">
        <div className="crumb-row">
          <p className="eyebrow">
            <Link to="/">Families</Link>
            <span aria-hidden="true"> / </span>
            {family.name}
          </p>
          <p className="tree-count">
            <span>{family.people.length} total</span>
            <span>{family.people.filter((person) => person.living).length} living</span>
          </p>
          <div className="stats-wrap" ref={statsRef}>
            <button
              type="button"
              className="button ghost"
              aria-expanded={statsOpen}
              onClick={() => setStatsOpen((open) => !open)}
            >
              Stats
            </button>
            {statsOpen && (
              <div className="stats-panel" role="dialog" aria-label="Family stats">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Group</th>
                      <th scope="col">Total</th>
                      <th scope="col">Males</th>
                      <th scope="col">Females</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.rows.map((row) => (
                      <tr key={row.label}>
                        <th scope="row">
                          {row.label}
                          {row.hint && <small>{row.hint}</small>}
                        </th>
                        <td>
                          {row.total}
                          <small>{row.living} living</small>
                        </td>
                        <td>
                          {row.males}
                          <small>{row.malesLiving} living</small>
                        </td>
                        <td>
                          {row.females}
                          <small>{row.femalesLiving} living</small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {stats.unknown > 0 && (
                  <p className="hint">
                    {stats.unknown} {stats.unknown === 1 ? "person has" : "people have"} no birth year, so they are counted
                    only in Total.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="toolbar-tools">
          <div className="search">
            <label className="sr-only" htmlFor="person-search">
              Find a person
            </label>
            <input
              id="person-search"
              value={query}
              placeholder="Search the family"
              onChange={(event) => setQuery(event.target.value)}
            />
            {matches.length > 0 && (
              <ul className="search-results">
                {matches.map((person) => (
                  <li key={person.id}>
                    <button
                      type="button"
                      data-testid="search-result"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setQuery("");
                        focusPerson(person.id);
                      }}
                    >
                      {fullName(person)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {toolbarExtra}
        </div>
      </div>

      {mode === "edit" && selected && (
        <div className="add-bar" data-testid="relative-bar">
          <p>{fullName(selected)}</p>
          <div className="rel-actions">
            {ADD_OPTIONS.map((option) => {
              const reason = blockReason(option.kind, selected, family);
              return (
                <button
                  key={option.kind}
                  type="button"
                  className="rel-button"
                  disabled={Boolean(reason)}
                  title={reason ?? `Add a ${option.label.toLowerCase()}`}
                  onClick={() => setDialog(option.kind)}
                >
                  {option.label}
                </button>
              );
            })}
            <button type="button" className="rel-button" onClick={() => setEditing(true)}>
              Edit
            </button>
            {confirming ? (
              <button type="button" className="button danger" onClick={removeSelected}>
                Confirm remove
              </button>
            ) : (
              <button type="button" className="rel-button" onClick={() => setConfirming(true)}>
                Remove
              </button>
            )}
          </div>
        </div>
      )}

      <div className="workspace-body">
        <TreeCanvas
          people={family.people}
          selectedId={selectedId}
          revealId={revealId}
          revealNonce={revealNonce}
          onSelectPerson={selectPerson}
          onOpenPerson={openPerson}
          onBackground={() => {
            if (mode === "view") {
              setSelectedId(null);
              setDetailsOpen(false);
            }
          }}
        />
      </div>

      {dialog && (
        <AddPersonDialog
          kind={dialog}
          selected={selected}
          spouses={selected ? spousesOf(selected, family.people) : []}
          defaultLastName={selected?.lastName || family.name}
          onCancel={() => setDialog(null)}
          onSubmit={submitNew}
        />
      )}
      {editing && selected && (
        <EditPersonDialog person={selected} onCancel={() => setEditing(false)} onSubmit={submitEdit} />
      )}
      {detailsOpen && selected && !editing && (
        <PersonDetailsDialog
          person={selected}
          people={family.people}
          onClose={() => setDetailsOpen(false)}
          onOpen={openPerson}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </section>
  );
}

function blockReason(kind: RelationKind, person: Family["people"][number], family: Family): string | null {
  if (kind !== "father" && kind !== "mother") return null;
  const gender = kind === "father" ? "male" : "female";
  const existing = parentOfGender(person, family.people, gender);
  if (existing) return `Already has a ${kind}: ${fullName(existing)}.`;
  if (person.parentIds.length >= 2) return "Already has two parents.";
  return null;
}
