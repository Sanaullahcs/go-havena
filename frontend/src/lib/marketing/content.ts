export const marketingSite = {
  name: "Havena",
  tagline: "A better place to belong.",
  description:
    "Havena brings people, conversations, events, and trusted resources together in one beautifully simple community platform.",
} as const;

export const navLinks = [
  { label: "Product", href: "/#product" },
  { label: "Communities", href: "/#communities" },
  { label: "Trust & Safety", href: "/#trust" },
  { label: "Company", href: "/#company" },
] as const;

export const trustLogos = [
  "Neighborhoods",
  "Schools",
  "Organizations",
  "Workplaces",
  "Management",
] as const;

export const peopleCards = [
  {
    title: "Neighborhoods & HOAs",
    description: "Facilitate deeper, more respectful connection in a trusted space.",
    icon: "home",
  },
  {
    title: "Schools & Families",
    description:
      "Keep families informed, engaged, and connected to the people and programs around their children.",
    icon: "school",
  },
  {
    title: "Organizations",
    description:
      "Build modular communities that meet membership, sharing, review, and governance needs.",
    icon: "users",
  },
  {
    title: "Workplaces",
    description:
      "Create a private internal culture with spaces for teams, hobbies, volunteers, and mission-led initiatives.",
    icon: "building",
  },
] as const;

export const trustFeatures = [
  "Role-based access and community permissions",
  "Verified membership options",
  "Simple reporting and moderation workflows",
  "No engagement-at-any-cost algorithms",
] as const;

export const testimonials = {
  featured: {
    quote:
      "Havena feels less like another platform and more like the digital front door our community has been missing.",
    role: "Community Executive",
  },
  cards: [
    {
      quote: "People understood it immediately. That matters more than another long list of features.",
      role: "Program Director",
    },
    {
      quote:
        "The product feels welcoming without looking clunky. It gives us the trust of enterprise software with the ease of a consumer app.",
      role: "Operations Lead",
    },
  ],
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
      { label: "Contact", href: "https://mail.google.com/mail/?view=cm&fs=1&to=hello%40gohavena.com" },
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
