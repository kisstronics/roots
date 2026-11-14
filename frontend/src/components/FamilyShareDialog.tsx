import { useState } from "react";
import { createShareLink, removeMember, revokeShareLink, setMemberRole, shareUrl, shareWithUser } from "../lib/storage";
import type { AccessEvent, FamilyEdit, FamilyMember, FamilyRole, ShareLink } from "../types";

const ROLE_LABEL: Record<FamilyRole, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

export function FamilyAccessPanel({
  slug,
  role,
  members,
  links,
  edits,
  accessLog,
  onChange,
}: {
  slug: string;
  role: FamilyRole;
  members: FamilyMember[];
  links: ShareLink[];
  edits: FamilyEdit[];
  accessLog: AccessEvent[];
  onChange: (next: { members: FamilyMember[]; links: ShareLink[]; accessLog: AccessEvent[] }) => void;
}) {
  const [email, setEmail] = useState("");
  const [memberRole, setShareRole] = useState<"editor" | "viewer">("editor");
  const [expiry, setExpiry] = useState<"30" | "60" | "never">("30");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canManage = role === "owner";

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="access-panel" aria-label="Family access">
      <div className="access-heading">
        <p className="eyebrow">Access</p>
        <p className="hint">
          You are the {ROLE_LABEL[role].toLowerCase()} of this tree.
          {canManage ? " We email them, including when they do not have an account yet." : ""}
        </p>
      </div>

      {canManage && (
        <form
          className="share-form"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const next = await shareWithUser(slug, email, memberRole);
              setEmail("");
              onChange({ members: next.members ?? members, links, accessLog: next.accessLog ?? accessLog });
            });
          }}
        >
          <label>
            Person’s email
            <input
              type="email"
              required
              value={email}
              placeholder="name@example.com"
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Access
            <select value={memberRole} onChange={(event) => setShareRole(event.target.value as "editor" | "viewer")}>
              <option value="editor">Can edit</option>
              <option value="viewer">Can view</option>
            </select>
          </label>
          <button type="submit" className="button primary" disabled={busy}>
            Add person
          </button>
        </form>
      )}

      {members.length === 0 ? (
        <p className="hint">{canManage ? "No one else can open this tree yet." : "No other people are listed."}</p>
      ) : (
        <ul className="member-list">
          {members.map((member) => (
            <li key={member.userId || member.email} className="member-row">
              <span>
                <strong>{member.name || member.email}</strong>
                <small>{member.pending ? "Invitation sent" : member.email}</small>
                {accessNote(member) && <small>{accessNote(member)}</small>}
              </span>
              {canManage ? (
                <span className="inline-actions">
                  <select
                    aria-label={`Access for ${member.email}`}
                    value={member.role}
                    onChange={(event) => {
                      const nextRole = event.target.value as "editor" | "viewer";
                      void run(async () => {
                        const next = await setMemberRole(slug, member.userId, nextRole);
                        onChange({ members: next.members ?? members, links, accessLog: next.accessLog ?? accessLog });
                      });
                    }}
                  >
                    <option value="editor">Can edit</option>
                    <option value="viewer">Can view</option>
                  </select>
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() => {
                      void run(async () => {
                        const next = await removeMember(slug, member.userId);
                        onChange({ members: next.members ?? members, links, accessLog: next.accessLog ?? accessLog });
                      });
                    }}
                  >
                    Remove
                  </button>
                </span>
              ) : (
                <span className="role-tag">{member.role === "editor" ? "Can edit" : "Can view"}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <details className="access-more">
        <summary>Links and changes</summary>
        <form
          className="share-form"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const next = await createShareLink(slug, expiry);
              onChange({ members, links: next.links ?? links, accessLog: next.accessLog ?? accessLog });
            });
          }}
        >
          <label>
            Link expires
            <select value={expiry} onChange={(event) => setExpiry(event.target.value as "30" | "60" | "never")}>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="never">Never</option>
            </select>
          </label>
          <button type="submit" className="button primary" disabled={busy}>
            Generate link
          </button>
        </form>
        {links.length === 0 && <p className="hint">A link lets someone view this tree without an account.</p>}
        <ul className="member-list">
          {links.map((link) => {
            const url = shareUrl(link.token);
            return (
              <li key={link.id} className="link-row">
                <span>
                  <code>{url}</code>
                  <small>{link.expiresAt ? `Expires ${formatWhen(link.expiresAt)}` : "Does not expire"}</small>
                </span>
                <span className="inline-actions">
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() => {
                      void run(async () => {
                        const next = await revokeShareLink(slug, link.id);
                        onChange({ members, links: next.links ?? links, accessLog: next.accessLog ?? accessLog });
                      });
                    }}
                  >
                    Revoke
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
        <h3>Access history</h3>
        {accessLog.length === 0 ? (
          <p className="hint">No access changes yet.</p>
        ) : (
          <ul className="edit-log">
            {accessLog.map((event) => (
              <li key={event.id}>
                <strong>{event.name || event.email}</strong> {accessAction(event)}
                <small>
                  {formatWhen(event.createdAt)}
                  {event.email ? ` · ${event.email}` : ""}
                </small>
              </li>
            ))}
          </ul>
        )}
        <h3>Tree changes</h3>
        {edits.length === 0 ? (
          <p className="hint">No edits have been recorded yet.</p>
        ) : (
          <ul className="edit-log">
            {edits.map((edit) => (
              <li key={edit.id}>
                <strong>{edit.name || edit.email}</strong> saved this tree
                <small>
                  {formatWhen(edit.createdAt)}
                  {edit.email ? ` · ${edit.email}` : ""}
                </small>
              </li>
            ))}
          </ul>
        )}
      </details>
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}

function accessNote(member: FamilyMember) {
  const created = member.createdBy ? `Added by ${member.createdBy}` : "";
  const updated = member.updatedBy && member.updatedBy !== member.createdBy ? `Updated by ${member.updatedBy}` : "";
  return [created, updated].filter(Boolean).join(" · ");
}

function accessAction(event: AccessEvent) {
  const who = event.targetEmail || "someone";
  const access = event.role === "editor" ? "edit" : event.role === "viewer" ? "view" : event.role;
  if (event.action === "invited") return `invited ${who} to ${access}`;
  if (event.action === "shared") return `gave ${who} ${access} access`;
  if (event.action === "role_changed") return `changed ${who} to ${access}`;
  if (event.action === "removed") return `removed ${who}`;
  if (event.action === "view_link") return "created the view link";
  if (event.action === "link_created") return "created a share link";
  if (event.action === "link_revoked") return "revoked a share link";
  if (event.action === "deleted") return "deleted this tree";
  return event.action;
}

function formatWhen(value: string) {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
