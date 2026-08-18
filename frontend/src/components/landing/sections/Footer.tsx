import Link from "next/link";
import { LandingSectionLink } from "../ui/LandingSectionLink";
import { Container } from "../ui/Container";
import { Logo } from "../ui/Logo";
import { footerColumns, site } from "@/lib/landing/site";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="lp-footer">
      <Container size="xl" className="lp-footer__inner">
        <div className="lp-footer__grid">
          <div className="lp-footer__brand">
            <Logo tone="light" />
            <p className="lp-footer__tagline">
              Your neighborhood, connected — verified notices, feed, marketplace, wellness, and
              property life in one place.
            </p>
          </div>

          <nav className="lp-footer__nav" aria-label="Footer">
            {footerColumns.map((col) => (
              <div key={col.title}>
                <h3 className="lp-footer__col-title">{col.title}</h3>
                <ul className="lp-footer__links">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      {link.sectionId ? (
                        <LandingSectionLink sectionId={link.sectionId} className="lp-footer__link">
                          {link.label}
                        </LandingSectionLink>
                      ) : (
                        <Link href={link.href ?? "#"} className="lp-footer__link">
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="lp-footer__bottom">
          <p>
            © {year} {site.name}. All rights reserved.
          </p>
          <p>Built for modern community living.</p>
        </div>
      </Container>
    </footer>
  );
}

export default Footer;
