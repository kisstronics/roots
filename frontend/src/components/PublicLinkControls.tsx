import { useEffect, useState } from "react";
import { generateShareLink, shareUrl } from "../lib/storage";

export function PublicLinkControls({
  slug,
  token,
  compact = false,
}: {
  slug: string;
  token: string | null;
  compact?: boolean;
}) {
  const [current, setCurrent] = useState(token);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrent(token);
  }, [slug, token]);

  const url = current ? shareUrl(current) : "";

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      setCurrent(await generateShareLink(slug));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not generate a link.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement("textarea");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <span className="share-url">
      {current ? (
        <>
          <input readOnly value={url} aria-label="Public link" title={url} onFocus={(event) => event.currentTarget.select()} />
          <button type="button" className="button ghost" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy link"}
          </button>
        </>
      ) : (
        <button type="button" className="button ghost" onClick={() => void generate()} disabled={busy}>
          {busy ? "Generating…" : "Generate link"}
        </button>
      )}
      {!compact && current && <span className="hint">Anyone with this link can view the tree. No login is required.</span>}
      {error && <span className="form-error">{error}</span>}
    </span>
  );
}
