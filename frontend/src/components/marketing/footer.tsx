import Link from "next/link";
import { HavenaMark } from "@/components/shared/havena-mark";
import { MarketingNavLink } from "@/components/marketing/nav-link";
import { footerColumns, footerCopy, footerSocialLinks, marketingSite } from "@/lib/marketing/content";
import { StoreBadges } from "@/components/marketing/store-badges";
import { gmailComposeUrl, marketingContact } from "@/lib/marketing/legal";

export function MarketingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-container">
        <div className="lp-footer__grid">
          <div className="lp-footer__brand">
            <Link href="/" className="lp-footer__logo">
              <HavenaMark size={36} tight />
              <span>{marketingSite.name}</span>
            </Link>
            <p>{footerCopy.blurb}</p>
          </div>

          {footerColumns.map((column) => (
            <div key={column.title} className="lp-footer__col">
              <h3>{column.title}</h3>
              <ul>
                {column.links.map((link) => (
                  <li key={link.label}>
                    <MarketingNavLink
                      href={link.href}
                      externalBlank={
                        link.href.startsWith("http://") || link.href.startsWith("https://")
                      }
                    >
                      {link.label}
                    </MarketingNavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="lp-footer__col lp-footer__emails-col">
            <h3>Contact</h3>
            <ul className="lp-footer__emails">
              <li>
                <span>{marketingContact.contactUs.label}</span>
                <a
                  href={gmailComposeUrl(marketingContact.contactUs.email)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {marketingContact.contactUs.email}
                </a>
              </li>
              <li>
                <span>{marketingContact.support.label}</span>
                <a
                  href={gmailComposeUrl(marketingContact.support.email)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {marketingContact.support.email}
                </a>
              </li>
            </ul>
          </div>

        </div>

        <div className="lp-footer__stores">
          <StoreBadges />
        </div>

        <div className="lp-footer__bottom">
          <p>
            © {new Date().getFullYear()} {marketingSite.name}. All rights reserved.
          </p>
          <div className="lp-footer__social">
            {footerSocialLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
