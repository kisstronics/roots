import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { slugify } from "../lib/people";
import { createFamily, isSafeSlug, loadOwnedIndex } from "../lib/storage";
import type { FamilySummary } from "../types";

export function AdminHomePage() {
  const navigate = useNavigate();
  const [families, setFamilies] = useState<FamilySummary[]>([]);
  const [maxFamilies, setMaxFamilies] = useState(10);
  const [familyCount, setFamilyCount] = useState(0);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
          <form
            className="create-line"
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
            <p className="eyebrow">New family</p>
            <input
              aria-label="Family name"
              value={name}
              placeholder="Family name"
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
            />
            <button type="submit" className="button primary" disabled={busy || atLimit}>
              {busy ? "Creating…" : "Create"}
            </button>
            <span className="hint">
              {familyCount} of {maxFamilies}
            </span>
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
                    View tree
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function roleLabel(role: FamilySummary["role"]) {
  if (role === "editor") return "Editor";
  if (role === "viewer") return "Viewer";
  return "Owner";
}
