import { Icon, type IconName } from "../icons/Icon";
import { Container } from "../ui/Container";

const FEATURES: { icon: IconName; tag: string; title: string; body: string }[] = [
  {
    icon: "shield-check",
    tag: "Security",
    title: "Verified access",
    body: "OTP login, utility bill checks, and admin approval keep every community private and trustworthy.",
  },
  {
    icon: "megaphone",
    tag: "Communications",
    title: "Notices & events",
    body: "Publish updates and activities that reach the right residents instantly, with no lost emails.",
  },
  {
    icon: "calendar-days",
    tag: "Operations",
    title: "Amenities & bookings",
    body: "Manage shared spaces with clear schedules so residents stop fighting over spreadsheets.",
  },
  {
    icon: "book-open",
    tag: "Engagement",
    title: "Wellness programs",
    body: "Courses, lessons, and streaks that help neighbors stay engaged beyond announcements.",
  },
  {
    icon: "store",
    tag: "Local",
    title: "Local marketplace",
    body: "Highlight community deals and trusted local offers without leaving the neighborhood app.",
  },
  {
    icon: "users",
    tag: "Administration",
    title: "Admin dashboard",
    body: "Approve members, manage operations, and stay in control from mobile or the web console.",
  },
];

export function Features() {
  return (
    <section id="features" className="lp-section lp-features scroll-mt-28">
      <Container size="xl">
        <div className="lp-features__head">
          <p className="lp-label lp-label--plain">Features</p>
          <h2 className="lp-features__title">
            <span className="lp-features__title-main">Everything your community needs.</span>
            <span className="lp-features__title-accent">Nothing it doesn&apos;t.</span>
          </h2>
          <p className="lp-body lp-features__lede">
            One calm surface for daily neighborhood life, designed for clarity and trust.
          </p>
        </div>

        <ul className="lp-features__grid">
          {FEATURES.map((f, index) => (
            <li
              key={f.title}
              className={`lp-features__item${index === 0 ? " lp-features__item--featured" : ""}`}
            >
              <article className="lp-features__card">
                <span className="lp-features__index" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="lp-features__tag">{f.tag}</span>
                <span className="lp-features__icon" aria-hidden="true">
                  <Icon name={f.icon} className="h-5 w-5" />
                </span>
                <div className="lp-features__content">
                  <h3 className="lp-features__card-title">{f.title}</h3>
                  <p className="lp-features__card-body">{f.body}</p>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export default Features;
