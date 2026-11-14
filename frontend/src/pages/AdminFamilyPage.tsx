import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { TreeWorkspace } from "../components/TreeWorkspace";
import { downloadFamily, enqueueSave, ensureViewLink, loadOwnedFamily, shareUrl, type FamilyAccess } from "../lib/storage";
import type { Family } from "../types";

export function AdminFamilyPage() {
  const { familySlug = "", personId } = useParams();
  const navigate = useNavigate();
  const [family, setFamily] = useState<Family | null>(null);
  const [access, setAccess] = useState<FamilyAccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Edits are saved to your account.");
  const [viewToken, setViewToken] = useState<string | null>(null);
  const [viewCopied, setViewCopied] = useState(false);

  useEffect(() => {
    let cancel = false;
    setFamily(null);
    setAccess(null);
    setError(null);
    loadOwnedFamily(familySlug)
      .then((loaded) => {
        if (cancel) return;
        if (!loaded) setError("This family does not exist.");
        else {
          setFamily(loaded.family);
          setAccess(loaded);
          setViewToken(loaded.viewToken);
          setStatus(loaded.role === "viewer" ? "You can view this tree." : "Edits are saved to your account.");
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
    document.title = `${access?.role === "viewer" ? "View" : "Edit"} ${family.name} · Our Roots`;
    if (personId && !family.people.some((person) => person.id === personId)) {
      navigate(`/admin/family/${family.slug}`, { replace: true });
    }
  }, [family, access, personId, navigate]);

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
      {family && access && (
          <TreeWorkspace
            family={family}
            mode={access.role === "viewer" ? "view" : "edit"}
            onChange={
              access.role === "viewer"
                ? undefined
                : (next) => {
                    setFamily(next);
                    setStatus("Saving…");
                    void enqueueSave(next).then(
                      () => setStatus("Saved."),
                      (reason) => setStatus(reason instanceof Error ? reason.message : "The family could not be saved."),
                    );
                  }
            }
            toolbarExtra={
              <div className="save-cluster">
                <span className="status-line">{status}</span>
                <ViewLink
                  token={viewToken}
                  copied={viewCopied}
                  onCopy={() => {
                    if (!viewToken) return;
                    void navigator.clipboard.writeText(shareUrl(viewToken)).then(() => {
                      setViewCopied(true);
                      window.setTimeout(() => setViewCopied(false), 2000);
                    });
                  }}
                  onGenerate={() => {
                    void ensureViewLink(family.slug).then(setViewToken, (reason) => {
                      setStatus(reason instanceof Error ? reason.message : "The view link could not be created.");
                    });
                  }}
                />
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

function ViewLink({
  token,
  copied,
  onCopy,
  onGenerate,
}: {
  token: string | null;
  copied: boolean;
  onCopy: () => void;
  onGenerate: () => void;
}) {
  if (!token) {
    return (
      <button type="button" className="button ghost" onClick={onGenerate}>
        View link
      </button>
    );
  }
  const url = shareUrl(token);
  return (
    <span className="view-link">
      <input readOnly value={url} aria-label="View link" onFocus={(event) => event.currentTarget.select()} />
      <button type="button" className="button ghost" onClick={onCopy}>
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
