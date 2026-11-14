import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { TreeWorkspace } from "../components/TreeWorkspace";
import { FamilyAccessPanel } from "../components/FamilyShareDialog";
import { deleteFamily, downloadFamily, enqueueSave, ensureViewLink, loadOwnedFamily, rememberFamily, shareUrl, type FamilyAccess } from "../lib/storage";
import type { Family } from "../types";

export function AdminFamilyPage() {
  const { familySlug = "", personId } = useParams();
  const navigate = useNavigate();
  const [family, setFamily] = useState<Family | null>(null);
  const [access, setAccess] = useState<FamilyAccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [viewToken, setViewToken] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
          setFamily(rememberFamily(loaded.family));
          setAccess(loaded);
          setViewToken(loaded.viewToken);
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
                    setSaveError(null);
                    void enqueueSave(next)
                      .then((saved) => {
                        setFamily((current) => {
                          if (!current || current.slug !== saved.slug) return current;
                          if (Date.parse(current.updatedAt) >= Date.parse(saved.updatedAt)) return current;
                          return { ...current, updatedAt: saved.updatedAt };
                        });
                      })
                      .catch((reason) => {
                        const stale = typeof reason === "object" && reason !== null && "stale" in reason && reason.stale;
                        if (stale) return;
                        const latest = typeof reason === "object" && reason !== null && "family" in reason ? reason.family : null;
                        if (latest && typeof latest === "object") setFamily(latest as Family);
                        setSaveError(reason instanceof Error ? reason.message : "The family could not be saved.");
                      });
                  }
            }
            toolbarExtra={
              <>
                <button type="button" className="button ghost" onClick={() => downloadFamily(family)}>
                  Download JSON
                </button>
                {access.role === "owner" && (
                  <button
                    type="button"
                    className="button danger"
                    onClick={() => {
                      setDeleteError(null);
                      setPendingDelete(true);
                    }}
                  >
                    Delete tree
                  </button>
                )}
              </>
            }
            saveError={saveError}
            accessView={
              <FamilyAccessView
                access={access}
                viewToken={viewToken}
                saveError={saveError}
                onViewToken={setViewToken}
                onChange={(next) => setAccess({ ...access, ...next })}
              />
            }
          />
      )}
      <SiteFooter />
      {pendingDelete && family && (
        <div className="backdrop" onMouseDown={() => setPendingDelete(false)}>
          <section
            className="modal"
            role="dialog"
            aria-labelledby="delete-tree-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Delete tree</p>
            <h2 id="delete-tree-title">Delete {family.name}?</h2>
            <p className="hint">The tree leaves your list and its view link stops opening.</p>
            {deleteError && <p className="form-error">{deleteError}</p>}
            <div className="modal-actions">
              <button type="button" className="button ghost" onClick={() => setPendingDelete(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="button danger"
                onClick={() => {
                  void deleteFamily(family.slug)
                    .then(() => navigate("/admin"))
                    .catch((reason) => {
                      setDeleteError(reason instanceof Error ? reason.message : "The tree could not be deleted.");
                    });
                }}
              >
                Delete tree
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function FamilyAccessView({
  access,
  viewToken,
  saveError,
  onViewToken,
  onChange,
}: {
  access: FamilyAccess;
  viewToken: string | null;
  saveError: string | null;
  onViewToken: (token: string) => void;
  onChange: (next: { members: FamilyAccess["members"]; links: FamilyAccess["links"]; accessLog: FamilyAccess["accessLog"] }) => void;
}) {
  const [linkError, setLinkError] = useState<string | null>(null);
  const urls = [
    ...(viewToken ? [{ id: "view", label: "View link", url: shareUrl(viewToken) }] : []),
    ...access.links.map((link) => ({
      id: link.id,
      label: link.expiresAt ? `Expires ${new Date(link.expiresAt).toLocaleDateString()}` : "Does not expire",
      url: shareUrl(link.token),
    })),
  ];

  return (
    <div className="family-access">
      <FamilyAccessPanel
        slug={access.family.slug}
        role={access.role}
        members={access.members}
        links={access.links}
        edits={access.edits}
        accessLog={access.accessLog}
        onChange={onChange}
      />
      <section className="generated-urls" aria-label="Generated links">
        <h2>Links</h2>
        {urls.length === 0 && (
          <button
            type="button"
            className="button ghost"
            onClick={() => {
              void ensureViewLink(access.family.slug).then(onViewToken, (reason) => {
                setLinkError(reason instanceof Error ? reason.message : "The view link could not be created.");
              });
            }}
          >
            Generate view link
          </button>
        )}
        <ul>
          {urls.map((item) => (
            <li key={item.id}>
              <span>{item.label}</span>
              <a href={item.url}>{item.url}</a>
            </li>
          ))}
        </ul>
        {linkError && <p className="form-error">{linkError}</p>}
        {saveError && <p className="form-error">{saveError}</p>}
      </section>
    </div>
  );
}
