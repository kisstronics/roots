import { useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { useAuth } from "../lib/auth";
import { apiUrl } from "../lib/paths";

const ERRORS: Record<string, string> = {
  google: "Google sign-in did not finish. Try again.",
  denied: "Google sign-in was cancelled.",
  "not-configured": "Google sign-in is not set up yet. Add the Google client id and secret on the server.",
  database: "The database is not available.",
  verify: "That Google account needs a verified email.",
};

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { user, ready } = useAuth();
  const signup = location.pathname.endsWith("/signup");
  const error = ERRORS[params.get("error") ?? ""] ?? null;

  useEffect(() => {
    document.title = signup ? "Sign up · Our Roots" : "Log in · Our Roots";
  }, [signup]);

  useEffect(() => {
    if (!ready || !user) return;
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from && from.startsWith("/admin") ? from : "/admin", { replace: true });
  }, [ready, user, navigate, location.state]);

  const mode = signup ? "signup" : "login";

  return (
    <div className="home">
      <SiteHeader />
      <main className="login-wrap">
        <section className="login-card">
          <p className="eyebrow">{signup ? "Sign up" : "Log in"}</p>
          <h1>{signup ? "Create an account with Google" : "Sign in with Google"}</h1>
          <p className="hint">
            {signup
              ? "Your Google account becomes your Our Roots account. If you have signed in before, this opens your families."
              : "Use the Google account for your families. A new Google account creates an Our Roots account."}
          </p>
          {error && <p className="form-error">{error}</p>}
          <a className="button primary" href={apiUrl(`/api/auth/google?mode=${mode}`)}>
            Continue with Google
          </a>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
