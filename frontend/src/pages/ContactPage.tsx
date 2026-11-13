import { useEffect, useState } from "react";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { enquiryError, sendEnquiry } from "../lib/contact";

export function ContactPage() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [enquiry, setEnquiry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    document.title = "Contact us · Our Roots";
  }, []);

  return (
    <div className="home">
      <SiteHeader />
      <main className="story">
        <p className="eyebrow">Contact us</p>
        <h1>Tell us what you need.</h1>
        {sent ? (
          <p>We have your enquiry. Someone from Knics Inc. will get back to you.</p>
        ) : (
          <form
            className="contact-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const input = { email, phone, enquiry };
              const problem = enquiryError(input);
              if (problem) {
                setError(problem);
                return;
              }
              setBusy(true);
              setError(null);
              try {
                await sendEnquiry(input);
                setSent(true);
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "The enquiry could not be sent.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <p className="hint">Leave an email or a phone number, and a short note about your enquiry.</p>
            <label>
              Email
              <input
                type="email"
                value={email}
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Phone number
              <input
                type="tel"
                value={phone}
                autoComplete="tel"
                onChange={(event) => setPhone(event.target.value)}
              />
            </label>
            <label>
              Enquiry
              <textarea
                value={enquiry}
                rows={5}
                maxLength={2000}
                required
                onChange={(event) => setEnquiry(event.target.value)}
              />
            </label>
            <p className="hint">{enquiry.trim().length}/2000</p>
            {error && <p className="form-error">{error}</p>}
            <button type="submit" className="button primary" disabled={busy}>
              {busy ? "Sending…" : "Send enquiry"}
            </button>
          </form>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
