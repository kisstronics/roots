import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { TreeWorkspace } from "../components/TreeWorkspace";
import { appUrl } from "../lib/paths";
import { loadFamily, loadSharedFamily } from "../lib/storage";
import type { Family } from "../types";

export function TreePage() {
  const { familySlug = "", personId, token = "" } = useParams();
  const navigate = useNavigate();
  const [family, setFamily] = useState<Family | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setFamily(null);
    setError(null);
    const load = token ? loadSharedFamily(token) : loadFamily(familySlug);
    load
      .then((loaded) => {
        if (cancel) return;
        if (!loaded) {
          setError(
            token
              ? "This link does not open a family. Ask the owner for a new one."
              : `No public family is saved at ${appUrl(`/tree/${familySlug}`)}.`,
          );
        } else setFamily(loaded);
      })
      .catch((reason) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "The family could not be read.");
      });
    return () => {
      cancel = true;
    };
  }, [familySlug, token]);

  useEffect(() => {
    if (!family) return;
    document.title = `${family.name} · Our Roots`;
    if (personId && !family.people.some((person) => person.id === personId)) {
      navigate(token ? `/share/${token}` : `/tree/${family.slug}`, { replace: true });
    }
  }, [family, personId, navigate, token]);

  return (
    <div className="tree-screen">
      <SiteHeader />
      {error && (
        <main className="narrow">
          <p className="eyebrow">{token ? "Unknown link" : "Unknown family"}</p>
          <h1>{error}</h1>
          <Link to="/">Back to families</Link>
        </main>
      )}
      {!error && !family && <p className="loading">Opening the family…</p>}
      {family && <TreeWorkspace family={family} mode="view" />}
      <SiteFooter />
    </div>
  );
}
