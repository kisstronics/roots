import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { slugify } from "../lib/people";
import { loadIndex } from "../lib/storage";
import type { FamilySummary } from "../types";

export function HomePage() {
  const navigate = useNavigate();
  const [families, setFamilies] = useState<FamilySummary[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Our Roots";
    loadIndex()
      .then(setFamilies)
      .catch(() => setError("The family list could not be read."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="home">
      <SiteHeader />
      <main>
        <section className="hero">
          <div>
            <p className="eyebrow">All Generations on Single Screen</p>
            <h1>Open a family tree and follow it as far as it goes.</h1>
            {/* <p className="lede">
              Each family lives in a JSON file. The screen shows parents, the chosen person, and their children.
              Open someone else to shift that window.
            </p> */}
            <form
              className="open-form"
              onSubmit={(event) => {
                event.preventDefault();
                const typed = name.trim().toLocaleLowerCase("en-US");
                const slug = slugify(name);
                const match = families.find(
                  (family) =>
                    family.slug.toLocaleLowerCase("en-US") === slug ||
                    family.name.trim().toLocaleLowerCase("en-US") === typed,
                );
                if (!match) {
                  setError(`No family is saved for “${name.trim() || "that name"}”.`);
                  return;
                }
                navigate(`/tree/${match.slug}`);
              }}
            >
              <label>
                Family name
                <input
                  value={name}
                  placeholder="Sharma"
                  onChange={(event) => {
                    setName(event.target.value);
                    setError(null);
                  }}
                />
              </label>
              <button type="submit" className="button primary" disabled={loading}>
                Open tree
              </button>
            </form>
            {loading && <p className="hint">Reading families…</p>}
            {!loading && (
              <p className="hint">Sign in to create a family. A shared link opens a tree without an account.</p>
            )}
            {error && <p className="form-error">{error}</p>}
            {/* <p className="hint">Or go straight to an address such as /tree/sharma or /tree/sharma/arjun.</p> */}
          </div>
          <HeroTree />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function HeroTree() {
  return (
    <svg className="hero-tree" viewBox="0 0 320 280" aria-hidden="true">
      <path d="M160 58v28M160 86H84v18M160 86h76v18M160 168v20" />
      <g className="male">
        <rect x="112" y="18" width="96" height="40" rx="12" />
        <text x="160" y="43">Parents</text>
      </g>
      <g className="focus">
        <rect x="22" y="104" width="124" height="52" rx="12" />
        <text x="84" y="134">Son</text>
      </g>
      <g className="female">
        <rect x="174" y="104" width="124" height="52" rx="12" />
        <text x="236" y="134">Daughter</text>
      </g>
      <g className="male">
        <rect x="98" y="188" width="124" height="52" rx="12" />
        <text x="160" y="218">Child</text>
      </g>
    </svg>
  );
}
