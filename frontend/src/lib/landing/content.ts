import type { IconName } from "@/components/landing/icons/Icon";

export type FeatureItem = {
  icon: IconName;
  title: string;
  body: string;
};

export const trustPills = [
  { label: "Verified neighbors", detail: "Invite-only communities" },
  { label: "AI-moderated", detail: "Human review when needed" },
  { label: "Mobile + web", detail: "iOS, Android, and dashboard" },
  { label: "Multilingual", detail: "English, Spanish, and Arabic" },
] as const;

export const featureGroups: {
  id: string;
  label: string;
  title: string;
  features: FeatureItem[];
  layout: "pair" | "bento" | "trio";
}[] = [
  {
    id: "informed",
    label: "Stay informed",
    title: "One trusted source for neighborhood news",
    layout: "pair",
    features: [
      {
        icon: "megaphone",
        title: "Digital notice board",
        body: "Announcements, events, alerts, and reminders — your community's single source of truth.",
      },
      {
        icon: "message-square",
        title: "Community feed",
        body: "A moderated social feed where neighbors share, discuss, and connect safely.",
      },
    ],
  },
  {
    id: "live-better",
    label: "Live better",
    title: "Daily life beyond the bulletin board",
    layout: "bento",
    features: [
      {
        icon: "store",
        title: "Neighborhood marketplace",
        body: "Local businesses, exclusive deals, coupons, and resident listings in one place.",
      },
      {
        icon: "heart",
        title: "Wellness hub",
        body: "Courses across weight, exercise, stress, learning, and social wellness — structured for real progress.",
      },
      {
        icon: "calendar-days",
        title: "Property management",
        body: "Community rules, documents, and amenity bookings for pool, BBQ, tennis, and meeting rooms.",
      },
    ],
  },
  {
    id: "trust",
    label: "Trust & engagement",
    title: "Built for safety and participation",
    layout: "trio",
    features: [
      {
        icon: "shield-check",
        title: "Secure verification",
        body: "Phone OTP, invite codes, and admin approval — only real neighbors get in.",
      },
      {
        icon: "trophy",
        title: "Gamification",
        body: "Points, badges, streaks, and leaderboards that reward meaningful participation.",
      },
      {
        icon: "bar-chart",
        title: "Admin dashboard",
        body: "Member approvals, moderation queue, marketplace management, and engagement analytics.",
      },
    ],
  },
];

export const residentBullets = [
  "Guest browsing before signup",
  "Biometric login on supported devices",
  "Push notifications for notices and events",
  "Multilingual experience (EN / ES / AR)",
] as const;

export const adminBullets = [
  "Approve members and manage access",
  "Publish notices, alerts, and events",
  "Moderate feed and marketplace content",
  "View engagement analytics on web",
] as const;

export const safetyPoints = [
  {
    icon: "shield-check" as const,
    title: "Verified residency",
    body: "Communities are invite-only. Admins review join requests before anyone can participate.",
  },
  {
    icon: "eye" as const,
    title: "AI-assisted moderation",
    body: "Content is scored and flagged automatically, with human review for edge cases.",
  },
  {
    icon: "lock" as const,
    title: "Scoped & private",
    body: "Not a public social network — data stays within your community boundary.",
  },
] as const;

export const howItWorksSteps = [
  {
    num: "01",
    title: "Find your community",
    body: "Search for your neighborhood or enter an invite code from your property manager.",
  },
  {
    num: "02",
    title: "Get verified",
    body: "Complete your profile and wait for admin approval — only verified neighbors join.",
  },
  {
    num: "03",
    title: "Connect",
    body: "Browse notices, join the feed, book amenities, discover deals, and explore wellness.",
  },
] as const;
