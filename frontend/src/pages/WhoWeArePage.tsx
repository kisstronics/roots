import { useEffect } from "react";
import { Link } from "react-router-dom";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

export function WhoWeArePage() {
  useEffect(() => {
    document.title = "Who we are · Our Roots";
  }, []);

  return (
    <div className="home">
      <SiteHeader />
      <main className="story">
        <p className="eyebrow">Knics Inc.</p>
        <h1>A thinking team, starting small.</h1>
        <p>
          Knics Inc. is a small team that likes to sit with an idea until it is simple enough to use. Our Roots is the
          first one we are putting in front of families.
        </p>
        <p>
          Family records usually end up split across phones, albums, and memory. We wanted one quiet tree: the people,
          the links between them, and a place to keep a photo or a note. Nothing larger than that, yet.
        </p>
        <p>
          We are starting with one family at a time. If the tree is useful, we will learn what to add next from the
          people who use it.
        </p>
        <p>
          <Link to="/contact">Contact us</Link> if you want a tree for your family, or if you have a thought about where
          this should go.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
