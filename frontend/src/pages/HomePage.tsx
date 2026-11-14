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
    <svg className="hero-tree" viewBox="0 0 320 300" aria-hidden="true">
      <path d="M160 58 V76 Q160 92 96 92 Q96 108 96 116" />
      <path d="M160 76 Q160 92 224 92 Q224 108 224 116" />
      <path className="spouse" d="M96 198 Q160 226 224 198" />
      <circle className="knot" cx="160" cy="212" r="3.5" />
      <path d="M160 212 V228" />
      <g className="portrait">
        <circle cx="160" cy="34" r="24" />
        <text x="160" y="74">Parents</text>
      </g>
      <g className="portrait focus">
        <circle cx="96" cy="144" r="26" />
        <text x="96" y="186">Son</text>
      </g>
      <g className="portrait female">
        <circle cx="224" cy="144" r="26" />
        <text x="224" y="186">Daughter</text>
      </g>
      <g className="portrait">
        <circle cx="160" cy="252" r="20" />
        <text x="160" y="286">Child</text>
      </g>
    </svg>
  );
}
