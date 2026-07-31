/**
 * Site-wide content + nav for the marketing landing page.
 */

export const site = {
  name: "NeighborLink",
  tagline: "Your neighborhood. Connected.",
  description:
    "NeighborLink brings everything your community needs into one smart platform: events, updates, resources, marketplace, and more.",
  url: "https://neighborlink.app",
} as const;

export type NavItem = {
  label: string;
  href?: string;
  sectionId?: string;
  badge?: string;
};

export const primaryNav: NavItem[] = [
  { label: "Features", sectionId: "features" },
  { label: "How it works", sectionId: "how-it-works" },
  { label: "Platform", sectionId: "about" },
  { label: "Contact", sectionId: "contact" },
];

export const footerColumns: { title: string; links: NavItem[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", sectionId: "features" },
      { label: "How it works", sectionId: "how-it-works" },
      { label: "Wellness Programs", sectionId: "features" },
      { label: "Marketplace", sectionId: "features" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", sectionId: "about" },
      { label: "Contact", sectionId: "contact" },
      { label: "Help Center", href: "#" },
      { label: "Community Guidelines", href: "#" },
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
  signUp: "/login",
  login: "/login",
  residentLogin: "/resident-login",
  home: "/home",
  profile: "/profile",
} as const;
