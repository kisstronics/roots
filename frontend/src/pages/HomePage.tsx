import { useEffect } from "react";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

export function HomePage() {
  useEffect(() => {
    document.title = "Our Roots";
  }, []);

  return (
    <div className="home">
      <SiteHeader />
      <main>
        <section className="hero">
          <div>
            <p className="eyebrow">All Generations on Single Screen</p>
            <h1>A family tree you can follow from one screen.</h1>
            <p className="hint">Sign in to create a family. A view link opens a tree without an account.</p>
          </div>
          <HeroTree />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function HeroTree() {
  return (
    <svg className="hero-tree" viewBox="0 0 320 280" aria-hidden="true">
      <path d="M160 58v28M160 86H84v18M160 86h76v18M160 168v20" />
      <g className="male">
        <rect x="112" y="18" width="96" height="40" rx="12" />
        <text x="160" y="43">Parents</text>
      </g>
      <g className="focus">
        <rect x="22" y="104" width="124" height="52" rx="12" />
        <text x="84" y="134">Son</text>
      </g>
      <g className="female">
        <rect x="174" y="104" width="124" height="52" rx="12" />
        <text x="236" y="134">Daughter</text>
      </g>
      <g className="male">
        <rect x="98" y="188" width="124" height="52" rx="12" />
        <text x="160" y="218">Child</text>
      </g>
    </svg>
  );
}
