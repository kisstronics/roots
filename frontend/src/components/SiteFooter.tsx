import { Link } from "react-router-dom";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>Knics Inc. @ 2026</p>
      <nav>
        <Link to="/who-we-are">Who we are</Link>
        <Link to="/contact">Contact us</Link>
      </nav>
    </footer>
  );
}
