import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function SiteHeader({ variant = "public" }: { variant?: "public" | "admin" }) {
  const navigate = useNavigate();
  const { user, ready, logout } = useAuth();
  const label = user?.name || user?.email || "";

  return (
    <header className="site-header">
      <Link to={variant === "admin" ? "/admin" : "/"} className="brand">
        <Mark />
        <span>
          <span className="brand-name">Our Roots</span>
          <span className="brand-note">{variant === "admin" ? "Your families" : "Family trees by Knics"}</span>
        </span>
      </Link>
      <nav className="nav-links">
        {ready && user && (
          <>
            {variant === "public" && <Link to="/admin">Your families</Link>}
            <Link to="/admin/access">Access</Link>
            {user.picture && <img className="user-photo" src={user.picture} alt="" referrerPolicy="no-referrer" />}
            {label && <span className="who">{label}</span>}
            <button
              type="button"
              className="button ghost"
              onClick={() => {
                void logout().then(() => navigate("/"));
              }}
            >
              Log out
            </button>
          </>
        )}
        {ready && !user && (
          <>
            <Link className="button ghost" to="/login">
              Log in
            </Link>
            <Link className="button primary" to="/signup">
              Sign up
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}

function Mark() {
  return (
    <svg className="mark" viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="18" cy="6.5" r="3" />
      <circle cx="8" cy="20" r="3" />
      <circle cx="28" cy="20" r="3" />
      <circle cx="18" cy="30" r="3" />
      <path d="M18 9.5v5.5M18 15 8 17M18 15l10 2M18 23v4" />
    </svg>
  );
}
