import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PublicLinkControls } from "../components/PublicLinkControls";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { TreeWorkspace } from "../components/TreeWorkspace";
import { downloadFamily, enqueueSave, loadOwnedFamily } from "../lib/storage";
import type { Family } from "../types";

export function AdminFamilyPage() {
  const { familySlug = "", personId } = useParams();
  const navigate = useNavigate();
  const [family, setFamily] = useState<Family | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Edits are saved to your account.");

  useEffect(() => {
    let cancel = false;
    setFamily(null);
    setShareToken(null);
    setError(null);
    loadOwnedFamily(familySlug)
      .then((loaded) => {
        if (cancel) return;
        if (!loaded) setError("This family does not exist.");
        else {
          setFamily(loaded.family);
          setShareToken(loaded.shareToken);
        }
      })
      .catch((reason) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "The family could not be read.");
      });
    return () => {
      cancel = true;
    };
  }, [familySlug]);

  useEffect(() => {
    if (!family) return;
    document.title = `Edit ${family.name} · Our Roots`;
    if (personId && !family.people.some((person) => person.id === personId)) {
      navigate(`/admin/family/${family.slug}`, { replace: true });
    }
  }, [family, personId, navigate]);

  return (
    <div className="tree-screen">
      <SiteHeader variant="admin" />
      {error && (
        <main className="narrow">
          <p className="eyebrow">Missing family</p>
          <h1>{error}</h1>
          <Link to="/admin">Back to your families</Link>
        </main>
      )}
      {!error && !family && <p className="loading">Opening the family…</p>}
      {family && (
        <TreeWorkspace
          family={family}
          mode="edit"
          onChange={(next) => {
            setFamily(next);
            setStatus("Saving…");
            void enqueueSave(next).then(
              () => setStatus("Saved."),
              (reason) => setStatus(reason instanceof Error ? reason.message : "The family could not be saved."),
            );
          }}
          toolbarExtra={
            <div className="save-cluster">
              <span className="status-line">{status}</span>
              <PublicLinkControls slug={family.slug} token={shareToken} compact />
              <button type="button" className="button ghost" onClick={() => downloadFamily(family)}>
                Download JSON
              </button>
            </div>
          }
        />
      )}
      <SiteFooter />
    </div>
  );
}
