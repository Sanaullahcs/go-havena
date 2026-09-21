/**
 * Site-wide content + nav for the marketing landing page.
 * Mirrors the reference design with six top-level nav items and
 * a "Get Started" CTA.
 */

export const site = {
    name: "Havena",
    tagline: "Your Neighborhood. Connected.",
    description:
        "Havena brings everything your community needs into one smart platform—events, updates, resources, marketplace, and more.",
    url: "https://havena.app",
} as const;

export type NavItem = {
    label: string;
    href: string;
};

/**
 * Top-level navigation links shown in the header.
 * Matches the reference design exactly.
 */
export const primaryNav: NavItem[] = [
    { label: "Home", href: "#top" },
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "About Us", href: "#about" },
    { label: "Pricing", href: "#pricing" },
    { label: "Contact", href: "#contact" },
];

/**
 * Footer link columns.
 */
export const footerColumns: { title: string; links: NavItem[] }[] = [
    {
        title: "Quick Links",
        links: [
            { label: "Home", href: "#top" },
            { label: "Features", href: "#features" },
            { label: "How It Works", href: "#how-it-works" },
            { label: "About Us", href: "#about" },
            { label: "Contact", href: "#contact" },
        ],
    },
    {
        title: "Support",
        links: [
            { label: "Help Center", href: "#" },
            { label: "Privacy Policy", href: "#" },
            { label: "Terms of Service", href: "#" },
            { label: "Community Guidelines", href: "#" },
        ],
    },
];

/**
 * Where the Sign Up and Login CTAs go.
 *
 * The dashboards (admin + resident portals) live in the separate
 * `frontend/` Next.js project and are reached at a different port
 * during local development. These are full absolute URLs to the
 * actual auth pages found in that project:
 *
 *   - `/login`           → admin login portal
 *                            (frontend/src/app/login/page.tsx)
 *   - `/resident-login`  → resident login portal
 *                            (frontend/src/app/resident-login/page.tsx)
 *   - `/`                → dashboard landing with the AuthPanel
 *                            that has both Login and Signup tabs;
 *                            used here for the "Get Started"
 *                            (signup) CTA.
 *   - `/home`            → authenticated resident portal
 *   - `/profile`         → user profile
 *
 * The dashboard origin can be overridden with the `NEXT_PUBLIC_DASHBOARD_URL`
 * env var, e.g. for a deployed/staging environment.
 */
const DASHBOARD_URL =
    process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "http://localhost:3000";

export const actionLinks = {
    /** Signup page — audience picker for resident or community admin. */
    signUp: `${DASHBOARD_URL}/register`,
    /** Login page — audience picker for resident or community admin. */
    login: `${DASHBOARD_URL}/login`,
    /** Resident login (same page, resident selected). */
    residentLogin: `${DASHBOARD_URL}/login?audience=resident`,
    residentSignUp: `${DASHBOARD_URL}/register?audience=resident`,
    /** Authenticated home (post-login destination). */
    home: `${DASHBOARD_URL}/home`,
    /** Profile page (logged-in user). */
    profile: `${DASHBOARD_URL}/profile`,
} as const;
