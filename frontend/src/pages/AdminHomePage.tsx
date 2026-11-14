import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { slugify } from "../lib/people";
import { createFamily, deleteFamily, isSafeSlug, loadOwnedIndex } from "../lib/storage";
import type { FamilySummary } from "../types";

export function AdminHomePage() {
  const navigate = useNavigate();
  const [families, setFamilies] = useState<FamilySummary[]>([]);
  const [maxFamilies, setMaxFamilies] = useState(10);
  const [familyCount, setFamilyCount] = useState(0);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<FamilySummary | null>(null);

  async function refresh() {
    const data = await loadOwnedIndex();
    setFamilies(data.families);
    setMaxFamilies(data.maxFamilies);
    setFamilyCount(data.familyCount);
  }

  useEffect(() => {
    document.title = "Your families · Our Roots";
    void refresh().catch((reason) => {
      setError(reason instanceof Error ? reason.message : "The family list could not be read.");
    });
  }, []);

  const atLimit = familyCount >= maxFamilies;

  return (
    <div className="home">
      <SiteHeader variant="admin" />
      <main className="admin-home">
        <section className="create-card">
          <p className="eyebrow">New family</p>
          <h1>Create a family</h1>
          <p className="hint">
            You have {familyCount} of {maxFamilies} families. Share a tree with another account, or make your own link.
          </p>
          <form
            className="open-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const slug = slugify(name);
              if (!isSafeSlug(slug)) {
                setError("Use a family name with letters or numbers.");
                return;
              }
              setBusy(true);
              setError(null);
              try {
                const family = await createFamily(name);
                navigate(`/admin/family/${family.slug}`);
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : "The family could not be created.");
                setBusy(false);
              }
            }}
          >
            <label>
              Family name
              <input
                value={name}
                placeholder="Nair"
                onChange={(event) => {
                  setName(event.target.value);
                  setError(null);
                }}
              />
            </label>
            <button type="submit" className="button primary" disabled={busy || atLimit}>
              {busy ? "Creating…" : "Create family"}
            </button>
          </form>
          {atLimit && <p className="form-error">You have reached the limit of {maxFamilies} families.</p>}
          {error && <p className="form-error">{error}</p>}
        </section>

        <section>
          <h2>Families</h2>
          {families.length === 0 && <p className="hint">No families yet.</p>}
          <div className="family-grid">
            {families.map((family) => (
              <article key={`${family.role ?? "own"}-${family.slug}`} className="family-card static">
                <span className="eyebrow">{roleLabel(family.role)}</span>
                <strong>{family.name}</strong>
                <span>
                  {family.people} {family.people === 1 ? "person" : "people"}
                  {family.generations > 0 && ` · ${family.generations} generations`}
                </span>
                <div className="inline-actions">
                  <Link className="button primary" to={`/admin/family/${family.slug}`}>
                    {family.role === "viewer" ? "View tree" : "Edit tree"}
                  </Link>
                  <Link className="button ghost" to={`/admin/access/${family.slug}`}>
                    Access
                  </Link>
                  {family.role === "owner" && (
                    <button type="button" className="button ghost" onClick={() => setPendingDelete(family)}>
                      Delete
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
      {pendingDelete && (
        <div className="backdrop" onMouseDown={() => setPendingDelete(null)}>
          <section
            className="modal"
            role="dialog"
            aria-labelledby="delete-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Delete family</p>
            <h2 id="delete-title">Delete {pendingDelete.name}?</h2>
            <p className="hint">
              The tree leaves your list and its view link stops opening. The record is kept.
            </p>
            <div className="modal-actions">
              <button type="button" className="button ghost" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="button danger"
                onClick={async () => {
                  const slug = pendingDelete.slug;
                  setPendingDelete(null);
                  await deleteFamily(slug);
                  await refresh();
                }}
              >
                Delete
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function roleLabel(role: FamilySummary["role"]) {
  if (role === "editor") return "Editor";
  if (role === "viewer") return "Viewer";
  return "Owner";
}
