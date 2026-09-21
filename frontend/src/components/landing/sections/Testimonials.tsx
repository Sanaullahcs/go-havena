import { Container } from "../ui/Container";
import { Icon } from "../icons/Icon";

type Story = {
  quote: string;
  name: string;
  role: string;
  community: string;
  initials: string;
};

const FEATURED: Story = {
  quote:
    "Member approvals that took days now finish before lunch. Residents finally have one place for notices, amenity bookings, and neighborhood updates.",
  name: "Elena V.",
  role: "Community admin",
  community: "Maple Ridge HOA",
  initials: "EV",
};

const STORIES: Story[] = [
  {
    quote:
      "We stopped forwarding PDFs in email threads. Havena keeps our neighborhood informed without the noise.",
    name: "Marcus W.",
    role: "Board president",
    community: "Cedar Point Village",
    initials: "MW",
  },
  {
    quote:
      "I booked the pool, joined a wellness class, and found a local deal before my morning coffee. It feels like a real community hub.",
    name: "Aisha K.",
    role: "Resident",
    community: "Brookside Commons",
    initials: "AK",
  },
  {
    quote:
      "Moving in was straightforward. Verify once, get approved, and you're connected to everything happening nearby.",
    name: "Tom & Lisa H.",
    role: "New residents",
    community: "Willow Creek Estates",
    initials: "TH",
  },
];

const HIGHLIGHTS = [
  { value: "Verified", label: "Members-only access" },
  { value: "Mobile + web", label: "Residents and admins" },
  { value: "One hub", label: "Notices to wellness" },
];

function StoryAvatar({ initials }: { initials: string }) {
  return (
    <span className="lp-stories__avatar" aria-hidden="true">
      {initials}
    </span>
  );
}

function StoryMeta({ story }: { story: Story }) {
  return (
    <figcaption className="lp-stories__meta">
      <StoryAvatar initials={story.initials} />
      <div className="lp-stories__meta-text">
        <span className="lp-stories__name">{story.name}</span>
        <span className="lp-stories__role">
          {story.role} · {story.community}
        </span>
      </div>
    </figcaption>
  );
}

export function Testimonials() {
  return (
    <section id="testimonials" className="lp-section lp-stories scroll-mt-28">
      <Container size="xl">
        <div className="lp-stories__layout">
          <div className="lp-stories__intro">
            <p className="lp-label lp-label--on-dark">Stories</p>
            <h2 className="lp-stories__title">Real communities. Real results.</h2>
            <p className="lp-stories__lede">
              Board members, admins, and residents share what changed when neighborhood life
              moved off scattered chats and into one trusted platform.
            </p>

            <ul className="lp-stories__highlights">
              {HIGHLIGHTS.map((item) => (
                <li key={item.label} className="lp-stories__highlight">
                  <span className="lp-stories__highlight-value">{item.value}</span>
                  <span className="lp-stories__highlight-label">{item.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <figure className="lp-stories__featured">
            <span className="lp-stories__quote-mark" aria-hidden="true">
              <Icon name="star" className="h-4 w-4" />
            </span>
            <blockquote className="lp-stories__quote">&ldquo;{FEATURED.quote}&rdquo;</blockquote>
            <StoryMeta story={FEATURED} />
          </figure>
        </div>

        <ul className="lp-stories__grid">
          {STORIES.map((story) => (
            <li key={story.name} className="lp-stories__card">
              <article>
                <span className="lp-stories__card-mark" aria-hidden="true">
                  &ldquo;
                </span>
                <p className="lp-stories__card-quote">{story.quote}</p>
                <StoryMeta story={story} />
              </article>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export default Testimonials;
