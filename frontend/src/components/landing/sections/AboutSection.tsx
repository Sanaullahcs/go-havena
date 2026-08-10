import { LandingSectionButton } from "../ui/LandingSectionButton";
import { Container } from "../ui/Container";
import { Icon, type IconName } from "../icons/Icon";

const AUDIENCES = [
  {
    icon: "home" as const,
    label: "Residents",
    channel: "Mobile app",
    points: ["Notices, events, and amenities", "Wellness and local deals", "Verified neighborhood access"],
  },
  {
    icon: "users" as const,
    label: "Community admins",
    channel: "Web dashboard",
    points: ["Approve members and manage access", "Publish updates and bookings", "Run operations from anywhere"],
  },
];

const PILLARS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "shield-check",
    title: "Verified membership",
    body: "OTP login, utility-bill checks, and admin approval keep every community private.",
  },
  {
    icon: "megaphone",
    title: "Daily operations",
    body: "Replace group chats and inboxes with one trusted system for neighborhood life.",
  },
  {
    icon: "heart",
    title: "Resident engagement",
    body: "Wellness programs and local deals help neighbors stay connected beyond announcements.",
  },
];

export function AboutSection() {
  return (
    <section id="platform" className="lp-section lp-platform scroll-mt-28">
      <Container size="xl">
        <div className="lp-platform__intro">
          <p className="lp-label lp-label--plain">The platform</p>
          <h2 className="lp-platform__title">
            <span className="lp-platform__title-main">Built for HOAs and neighborhoods.</span>
            <span className="lp-platform__title-accent">Not another social feed.</span>
          </h2>
          <p className="lp-body lp-platform__lede">
            Havena brings verified membership, daily operations, and resident engagement into one calm
            platform. Residents use the mobile app; admins manage the community from mobile or web.
          </p>
        </div>

        <div className="lp-platform__audiences">
          {AUDIENCES.map((item) => (
            <article key={item.label} className="lp-platform__audience">
              <div className="lp-platform__audience-head">
                <span className="lp-platform__audience-icon" aria-hidden="true">
                  <Icon name={item.icon} className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="lp-platform__audience-label">{item.label}</h3>
                  <p className="lp-platform__audience-channel">{item.channel}</p>
                </div>
              </div>
              <ul className="lp-platform__audience-list">
                {item.points.map((point) => (
                  <li key={point}>
                    <Icon name="check-circle-2" className="h-4 w-4 shrink-0" />
                    {point}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <ul className="lp-platform__grid">
          {PILLARS.map((item) => (
            <li key={item.title} className="lp-platform__card">
              <span className="lp-platform__card-icon" aria-hidden="true">
                <Icon name={item.icon} className="h-5 w-5" />
              </span>
              <h3 className="lp-platform__card-title">{item.title}</h3>
              <p className="lp-platform__card-body">{item.body}</p>
            </li>
          ))}
        </ul>

        <div className="lp-platform__footer">
          <LandingSectionButton
            sectionId="features"
            variant="primary"
            size="lg"
            className="lp-platform__cta"
            iconTrailing="arrow-right"
          >
            Explore features
          </LandingSectionButton>
        </div>
      </Container>
    </section>
  );
}

export default AboutSection;
