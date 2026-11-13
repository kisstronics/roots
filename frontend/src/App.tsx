import type { ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";
import { useAuth } from "./lib/auth";
import { AdminFamilyPage } from "./pages/AdminFamilyPage";
import { AdminHomePage } from "./pages/AdminHomePage";
import { ContactPage } from "./pages/ContactPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { TreePage } from "./pages/TreePage";
import { WhoWeArePage } from "./pages/WhoWeArePage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/who-we-are" element={<WhoWeArePage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<LoginPage />} />
      <Route path="/admin/login" element={<Navigate to="/login" replace />} />
      <Route path="/tree/:familySlug" element={<TreePage />} />
      <Route path="/tree/:familySlug/:personId" element={<TreePage />} />
      <Route path="/share/:token" element={<TreePage />} />
      <Route path="/share/:token/:personId" element={<TreePage />} />
      <Route
        path="/admin"
        element={
          <RequireUser>
            <AdminHomePage />
          </RequireUser>
        }
      />
      <Route
        path="/admin/family/:familySlug"
        element={
          <RequireUser>
            <AdminFamilyPage />
          </RequireUser>
        }
      />
      <Route
        path="/admin/family/:familySlug/:personId"
        element={
          <RequireUser>
            <AdminFamilyPage />
          </RequireUser>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function RequireUser({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, ready } = useAuth();
  if (!ready) return <p className="loading">Checking your account…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function NotFound() {
  return (
    <div className="home">
      <SiteHeader />
      <main className="narrow">
        <p className="eyebrow">Missing page</p>
        <h1>That address is not part of Our Roots.</h1>
        <Link to="/">Back to families</Link>
      </main>
      <SiteFooter />
    </div>
  );
}
