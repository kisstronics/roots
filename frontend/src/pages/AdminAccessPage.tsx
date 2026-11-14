import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FamilyAccessPanel } from "../components/FamilyShareDialog";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { loadOwnedFamily, loadOwnedIndex, type FamilyAccess } from "../lib/storage";
import type { FamilySummary } from "../types";

export function AdminAccessPage() {
  const { familySlug = "" } = useParams();
  const navigate = useNavigate();
  const [families, setFamilies] = useState<FamilySummary[]>([]);
  const [access, setAccess] = useState<FamilyAccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Access · Our Roots";
    let cancel = false;
    loadOwnedIndex()
      .then((data) => {
        if (cancel) return;
        setFamilies(data.families);
        if (!familySlug && data.families[0]) navigate(`/admin/access/${data.families[0].slug}`, { replace: true });
      })
      .catch((reason) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "The family list could not be read.");
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [familySlug, navigate]);

  useEffect(() => {
    if (!familySlug) {
      setAccess(null);
      return;
    }
    let cancel = false;
    setAccess(null);
    setError(null);
    loadOwnedFamily(familySlug)
      .then((loaded) => {
        if (cancel) return;
        if (!loaded) setError("This family does not exist.");
        else setAccess(loaded);
      })
      .catch((reason) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "Access could not be read.");
      });
    return () => {
      cancel = true;
    };
  }, [familySlug]);

  return (
    <div className="home">
      <SiteHeader variant="admin" />
      <main className="admin-home">
        <p className="eyebrow">Access</p>
        <h1>Share a family</h1>
        <p className="hint">
          Give someone edit or view access. If they are not on Our Roots yet, they still get an email and can sign up
          with that address.
        </p>
        {loading && <p className="hint">Opening access…</p>}
        {!loading && families.length === 0 && (
          <p className="hint">
            No families yet. <Link to="/admin">Create one</Link> before sharing it.
          </p>
        )}
        {families.length > 1 && (
          <label>
            Family
            <select value={familySlug} onChange={(event) => navigate(`/admin/access/${event.target.value}`)}>
              {families.map((family) => (
                <option key={`${family.role ?? "own"}-${family.slug}`} value={family.slug}>
                  {family.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && <p className="form-error">{error}</p>}
        {access && (
          <FamilyAccessPanel
            slug={access.family.slug}
            role={access.role}
            members={access.members}
            links={access.links}
            edits={access.edits}
            accessLog={access.accessLog}
            onChange={(next) => setAccess({ ...access, ...next })}
          />
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
