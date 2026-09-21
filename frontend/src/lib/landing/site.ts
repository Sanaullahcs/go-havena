/**
 * Site-wide content + nav for the marketing landing page.
 */

export const site = {
  name: "Havena",
  tagline: "Your neighborhood, connected.",
  description:
    "Havena is a hyperlocal community platform for verified residents — notices, feed, marketplace, wellness, and property life in one moderated place.",
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
  { label: "Features", sectionId: "features" },
  { label: "For residents", sectionId: "residents" },
  { label: "For admins", sectionId: "admins" },
  { label: "Contact", sectionId: "contact" },
];

export const footerColumns: { title: string; links: NavItem[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", sectionId: "features" },
      { label: "For residents", sectionId: "residents" },
      { label: "For admins", sectionId: "admins" },
      { label: "How it works", sectionId: "how-it-works" },
    ],
  },
  {
    title: "For admins",
    links: [
      { label: "Admin sign in", href: "/login" },
      { label: "Admin sign up", href: "/register" },
      { label: "Resident sign in", href: "/login?audience=resident" },
      { label: "Resident sign up", href: "/register?audience=resident" },
      { label: "Contact", sectionId: "contact" },
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
  residentLogin: "/login?audience=resident",
  residentSignUp: "/register?audience=resident",
  home: "/home",
  profile: "/profile",
  pricing: "/#pricing",
} as const;

/** Product imagery under /public/landing */
export const landingImages = {
  /** Admin dashboard browser mockup */
  dashboardMockup: "/landing/dashboard-mockup.png",
} as const;
