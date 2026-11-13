import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PublicLinkControls } from "../components/PublicLinkControls";
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
            You have {familyCount} of {maxFamilies} families. Generate a link when you want someone to view a tree
            without logging in.
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
              <article key={`${family.publicTree ? "public" : "own"}-${family.slug}`} className="family-card static">
                <span className="eyebrow">{family.publicTree ? "Public tree" : "Private until shared"}</span>
                <strong>{family.name}</strong>
                <span>
                  {family.people} {family.people === 1 ? "person" : "people"}
                  {family.generations > 0 && ` · ${family.generations} generations`}
                </span>
                <PublicLinkControls slug={family.slug} token={family.shareToken ?? null} />
                <div className="inline-actions">
                  <Link className="button primary" to={`/admin/family/${family.slug}`}>
                    Edit tree
                  </Link>
                  <button
                    type="button"
                    className="button ghost"
                    onClick={async () => {
                      if (!window.confirm(`Delete the ${family.name} family?`)) return;
                      await deleteFamily(family.slug);
                      await refresh();
                    }}
                  >
                    Delete
                  </button>
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
