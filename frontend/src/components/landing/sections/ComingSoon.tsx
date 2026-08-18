import Link from "next/link";
import { HavenaMark } from "@/components/shared/havena-mark";
import { HavenaAppScreenPreview } from "@/components/landing/ui/HavenaAppScreenPreview";
import { site } from "@/lib/landing/site";

export function ComingSoon() {
  return (
    <section className="lp-coming-soon" aria-label="Coming soon">
      <div className="lp-coming-soon__media" aria-hidden>
        <div className="lp-coming-soon__preview">
          <HavenaAppScreenPreview />
        </div>
        <div className="lp-coming-soon__wash" />
      </div>

      <div className="lp-coming-soon__content">
        <div className="lp-coming-soon__brand">
          <HavenaMark size={56} className="lp-coming-soon__mark" />
          <h1 className="lp-coming-soon__name">{site.name}</h1>
        </div>

        <p className="lp-coming-soon__headline">Coming soon</p>
        <p className="lp-coming-soon__lede">
          A calmer home for community life — notices, amenities, and neighbors, in one place.
        </p>

        <a className="lp-coming-soon__contact" href={`mailto:${site.contactEmail}`}>
          {site.contactEmail}
        </a>
      </div>

      <nav className="lp-coming-soon__links" aria-label="Account">
        <Link href="/login">Community admin</Link>
        <span aria-hidden>·</span>
        <Link href="/resident-login">Resident portal</Link>
      </nav>
    </section>
  );
}
