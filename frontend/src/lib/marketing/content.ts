export const marketingSite = {
  name: "Havena",
  tagline: "One trusted place for the whole neighborhood.",
  description: "One trusted place for the whole neighborhood.",
} as const;

export const heroCopy = {
  eyebrow: "For HOAs, neighborhoods, and every resident",
  titleBefore: "One trusted place for",
  titleAccent: "the whole neighborhood.",
  leadLines: [
    "HOAs, neighborhoods, and everyday community life.",
    "Membership, guests, events, and a private app for every resident.",
  ],
  proof: "Trusted by neighborhoods and communities around the world.",
  cta: "Start your community",
  secondary: "Explore the product",
} as const;

export const storeLinks = {
  apple: "https://apps.apple.com/app/id6800697897",
  play: "https://play.google.com/store/apps/details?id=com.zsquare.havena",
} as const;

export const navLinks = [
  { label: "Home", href: "/" },
  { label: "Product", href: "/#product" },
  { label: "Communities", href: "/#communities" },
  { label: "Trust & Safety", href: "/#trust" },
  { label: "Company", href: "/#company" },
  { label: "Pricing", href: "/pricing" },
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
  lead: "The board sees the week. Residents see the neighborhood. Both open the same place.",
  mainTag: "Community admin",
  mainTitleLine1: "Begin the day with a clear picture",
  mainTitleLine2: "of the community.",
  mainText:
    "Membership, notices, and activity live in one view, so the week is not rebuilt from email threads and group chats.",
  points: [
    { label: "Membership", detail: "Who belongs" },
    { label: "Notices", detail: "What was sent" },
    { label: "Activity", detail: "What is happening" },
  ],
  cards: [
    {
      kicker: "Who can enter",
      title: "Verified access across the whole community.",
      text: "Membership, guests, amenities, the feed, and the marketplace stay with people who belong there.",
    },
    {
      kicker: "Daily life",
      title: "A resident app for the neighborhood.",
      text: "The feed, local deals, and amenities arrive with the plan. Neighbors do not need a second product.",
    },
  ],
} as const;

export const peopleCopy = {
  eyebrow: "Who Havena is for",
  titleLines: ["For neighborhoods, schools,", "workplaces, and more."],
  lead: "A private place for the people who belong there, whether they share a street, a school, or a workplace.",
} as const;

export const peopleCards = [
  {
    title: "Neighborhoods & HOAs",
    kicker: "Where people live",
    description: "Notices, guests, and amenities stay with the people who live there.",
    icon: "home",
    tone: "home",
  },
  {
    title: "Schools & Families",
    kicker: "Verified families",
    description: "Programs and events stay with families you know, not in a group anyone can join.",
    icon: "school",
    tone: "school",
  },
  {
    title: "Organizations",
    kicker: "A closed membership",
    description: "Roles, membership, and shared resources for an association that should stay private.",
    icon: "users",
    tone: "org",
  },
  {
    title: "Workplaces",
    kicker: "Off public social apps",
    description: "Notices and groups for a team or a campus, kept with the people who work there.",
    icon: "building",
    tone: "work",
  },
] as const;

export const trustCopy = {
  eyebrow: "Trust & safety",
  titleLines: ["Closed to the public.", "Open to every resident."],
  lead: "Roles decide who can see what, and the board keeps moderation in hand.",
} as const;

export const trustFeatures = [
  "Admins, residents, and guests each keep their own access",
  "Membership is checked before anything private appears",
  "The board can review, report, and moderate",
] as const;

export const quotesCopy = {
  eyebrow: "From people who run communities",
  title: "What changes when the neighborhood has one place to go.",
  titleLines: ["What changes when the", "neighborhood has one place to go."],
  lead: "Boards, managers, and resident teams, in their own words.",
} as const;

export const testimonials = [
  {
    quote:
      "Announcements left the inbox. The board opens one dashboard, and the neighborhood already knows where to look.",
    name: "Amira Cole",
    role: "HOA board president",
  },
  {
    quote:
      "By the first morning, neighbors had found their way. No training session. No printed guide.",
    name: "Priya Shah",
    role: "Community manager",
  },
  {
    quote:
      "The board, the residents, and the guests each keep their own side of the community. That quiet boundary is what made us comfortable.",
    name: "Chris Nguyen",
    role: "Resident services lead",
  },
] as const;

export const ctaCopy = {
  eyebrow: "Start with the community",
  titleLines: ["Bring your community", "onto Havena."],
  lead: "Open an admin account, choose how the community pays, and invite people when you are ready.",
  steps: [
    { title: "Admin account", detail: "You open Havena" },
    { title: "Community plan", detail: "The community pays" },
    { title: "Resident invites", detail: "They are never billed" },
  ],
  button: "Request a demo",
} as const;

export const footerCopy = {
  blurb: "One trusted place for the whole neighborhood. The community pays. Residents never do.",
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
