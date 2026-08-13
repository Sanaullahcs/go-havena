/**
 * Site-wide content + nav for the marketing landing page.
 */

export const site = {
  name: "Havena",
  tagline: "Run your community. Invite residents. One subscription.",
  description:
    "Havena is the community platform for HOAs and neighborhoods — subscribe once, invite residents, and run notices, amenities, wellness, and local life in one place.",
  url: "https://havena.app",
  contactEmail: "hello@gohavena.com",
  contactPhone: "+1 (555) 123-4567",
} as const;

export type NavItem = {
  label: string;
  href?: string;
  sectionId?: string;
  badge?: string;
};

export const primaryNav: NavItem[] = [
  { label: "Platform", sectionId: "platform" },
  { label: "Pricing", sectionId: "pricing" },
  { label: "How it works", sectionId: "how-it-works" },
  { label: "FAQ", sectionId: "faq" },
];

export const footerColumns: { title: string; links: NavItem[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Platform", sectionId: "platform" },
      { label: "Pricing", sectionId: "pricing" },
      { label: "Features", sectionId: "features" },
      { label: "How it works", sectionId: "how-it-works" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "FAQ", sectionId: "faq" },
      { label: "Contact", sectionId: "contact" },
      { label: "Admin sign in", href: "/login" },
      { label: "Admin sign up", href: "/register" },
      { label: "Resident portal", href: "/resident-login" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy-policy" },
      { label: "Terms of Service", href: "/terms-of-service" },
    ],
  },
];

export const socialLinks = [
  { name: "facebook", label: "Facebook", href: "#" },
  { name: "instagram", label: "Instagram", href: "#" },
  { name: "twitter", label: "Twitter", href: "#" },
  { name: "youtube", label: "YouTube", href: "#" },
] as const;

/** Internal dashboard routes — same Next.js app. */
export const actionLinks = {
  signUp: "/register",
  login: "/login",
  residentLogin: "/resident-login",
  home: "/home",
  profile: "/profile",
  pricing: "/#pricing",
} as const;

/** Neighborhood atmosphere — place first, not empty luxury staging. */
export const landingImages = {
  heroCommunity:
    "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1400&q=88",
  /** Full-bleed tree-lined neighborhood street at dusk */
  hero: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=2200&q=88",
  platform: "https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&w=1200&q=85",
  about: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=85",
  howItWorks: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=900&q=85",
} as const;
