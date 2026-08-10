/**
 * Site-wide content + nav for the marketing landing page.
 */

export const site = {
  name: "Havena",
  tagline: "Your neighborhood, connected.",
  description:
    "Havena brings community life into one smart platform — notices, amenities, wellness, marketplace, and more.",
  url: "https://havena.app",
  contactEmail: "hello@havena.app",
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
  { label: "How it works", sectionId: "how-it-works" },
  { label: "Features", sectionId: "features" },
  { label: "Stories", sectionId: "testimonials" },
  { label: "FAQ", sectionId: "faq" },
  { label: "Contact", sectionId: "contact" },
];

export const footerColumns: { title: string; links: NavItem[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Platform", sectionId: "platform" },
      { label: "Features", sectionId: "features" },
      { label: "How it works", sectionId: "how-it-works" },
      { label: "Wellness", sectionId: "features" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Stories", sectionId: "testimonials" },
      { label: "FAQ", sectionId: "faq" },
      { label: "Contact", sectionId: "contact" },
      { label: "Help Center", href: "#" },
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

/** Professional community photography. */
export const landingImages = {
  /** Community/neighborhood hero visual */
  heroCommunity:
    "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1400&q=88",
  /** Legacy full-bleed hero (unused) */
  hero: "https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?auto=format&fit=crop&w=2200&q=88",
  /** Modern residential neighborhood — HOA community living */
  platform: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=85",
  about: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=85",
  howItWorks: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=900&q=85",
} as const;
