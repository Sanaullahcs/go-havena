export const marketingSite = {
  name: "Havena",
  tagline: "One trusted place for the whole neighborhood.",
  description: "One trusted place for the whole neighborhood.",
} as const;

export const heroCopy = {
  eyebrow: "For HOAs, neighborhoods, and every resident",
  titleBefore: "One trusted place for",
  titleAccent: "the whole neighborhood.",
  lead: "HOAs, neighborhoods, and everyday community life. Membership, guests, events, and a private app for every resident.",
  proof: "Trusted by neighborhoods and communities around the world.",
  cta: "Start your community",
  secondary: "Explore the product",
} as const;

export const storeLinks = {
  apple: "https://apps.apple.com/app/id6800697897",
  play: "https://play.google.com/store/apps/details?id=com.zsquare.havena",
} as const;

export const navLinks = [
  { label: "Product", href: "/#product" },
  { label: "Communities", href: "/#communities" },
  { label: "Trust & Safety", href: "/#trust" },
  { label: "Company", href: "/#company" },
] as const;

export const trustLogos = [
  "Neighborhoods",
  "HOAs",
  "Apartments",
  "Campuses",
  "Community boards",
] as const;

export const productCopy = {
  eyebrow: "The product",
  titleLine1: "A dashboard for the board.",
  titleLine2: "An app for every resident.",
  mainTag: "Community admin",
  mainTitleLine1: "Begin the day with a clear picture",
  mainTitleLine2: "of the community.",
  mainText:
    "Membership, notices, and activity live in one view — so you are not reconstructing the week from email threads and group chats.",
  cards: [
    {
      title: "Verified access across the whole community.",
      text: "Membership, guests, amenities, the resident feed, and marketplace stay with people who belong there.",
    },
    {
      title: "A resident app built for daily neighborhood life.",
      text: "Feed, local deals, and amenities arrive with the plan. Neighbors do not need a second product to participate.",
    },
  ],
} as const;

export const peopleCopy = {
  eyebrow: "Who Havena is for",
  title: "For neighborhoods, schools, workplaces, and more.",
} as const;

export const peopleCards = [
  {
    title: "Neighborhoods & HOAs",
    description: "Notices, guest access, amenities, and a private feed for the people who actually live there.",
    icon: "home",
  },
  {
    title: "Schools & Families",
    description: "Keep programs and events with verified families — not in a public group anyone can join.",
    icon: "school",
  },
  {
    title: "Organizations",
    description: "Membership, roles, and shared resources for associations that need a closed community.",
    icon: "users",
  },
  {
    title: "Workplaces",
    description: "Internal notices and groups for teams or campus housing, kept off public social apps.",
    icon: "building",
  },
] as const;

export const trustCopy = {
  eyebrow: "Trust & safety",
  title: "Closed to the public. Open to the people who live there.",
  lead: "Havena treats privacy as the product. Roles decide who sees what, and the board keeps moderation in hand.",
} as const;

export const trustFeatures = [
  "Separate access for admins, residents, and guests",
  "Membership is verified before community content appears",
  "Reporting and moderation tools for community staff",
] as const;

export const quotesCopy = {
  eyebrow: "From community leaders",
  title: "What changes when the neighborhood has one place to go.",
} as const;

export const testimonials = [
  {
    quote:
      "Notices left our inboxes. The board finally has a single dashboard, and residents know where to look.",
    name: "Amira Cole",
    role: "HOA Board President",
  },
  {
    quote: "People understood it on the first morning. We did not need a training session.",
    name: "Priya Shah",
    role: "Community Manager",
  },
  {
    quote: "The board, residents, and guests each see only what they should. That clarity is the whole point.",
    name: "Chris Nguyen",
    role: "Resident Services Lead",
  },
] as const;

export const ctaCopy = {
  title: "Bring your community onto Havena.",
  lead: "Create an admin account, choose a seat plan, and invite residents. They are never billed by Havena.",
  button: "Request a demo",
} as const;

export const footerCopy = {
  blurb: "One trusted place for the whole neighborhood.",
} as const;

export const footerColumns = [
  {
    title: "Product",
    links: [
      { label: "Overview", href: "/#product" },
      { label: "Solutions", href: "/#communities" },
      { label: "Pricing & Plans", href: "/register" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Us", href: "/#company" },
      { label: "Careers", href: "/#company" },
      { label: "Request a Demo", href: "/request-demo" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Help Center", href: "https://mail.google.com/mail/?view=cm&fs=1&to=support%40gohavena.com" },
      { label: "Privacy", href: "/privacy-policy" },
      { label: "Terms", href: "/terms-and-conditions" },
    ],
  },
] as const;

export const footerSocialLinks = [
  { label: "Twitter", href: "https://twitter.com/" },
  { label: "LinkedIn", href: "https://www.linkedin.com/" },
  { label: "Instagram", href: "https://www.instagram.com/" },
  { label: "YouTube", href: "https://www.youtube.com/" },
] as const;
