export const marketingContact = {
  contactUs: {
    label: "Contact us",
    email: "hello@gohavena.com",
  },
  support: {
    label: "Support",
    email: "support@gohavena.com",
  },
} as const;

/** Opens Gmail compose for the given address (web Gmail, not the OS mail client). */
export function gmailComposeUrl(email: string) {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`;
}

export type LegalSection = {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export const privacyPolicy = {
  title: "Privacy Policy",
  updatedAt: "August 31, 2026",
  intro:
    "This Privacy Policy explains how Havena collects, uses, and protects information when you use our community platform, websites, and related services.",
  sections: [
    {
      id: "overview",
      title: "1. Overview",
      paragraphs: [
        "Havena provides tools for communities to communicate, share notices and events, manage membership, and access trusted local resources.",
        "We collect only the information needed to operate the service, support community administrators, and keep residents safe.",
      ],
    },
    {
      id: "information-we-collect",
      title: "2. Information we collect",
      paragraphs: ["Depending on how you use Havena, we may collect:"],
      bullets: [
        "Account details such as name, email address, phone number, and profile information",
        "Community details such as community name, membership role, unit information, and admin settings",
        "Content you submit, including notices, events, messages, marketplace listings, and reports",
        "Usage and device information needed for security, diagnostics, and product improvement",
        "Billing and subscription information for community administrators when applicable",
      ],
    },
    {
      id: "how-we-use",
      title: "3. How we use information",
      paragraphs: ["We use information to:"],
      bullets: [
        "Provide, maintain, and improve the Havena platform",
        "Authenticate users and manage community access permissions",
        "Send service-related communications such as login codes, notices, and account updates",
        "Support moderation, safety, fraud prevention, and abuse investigation",
        "Process subscriptions and respond to support requests",
      ],
    },
    {
      id: "sharing",
      title: "4. How we share information",
      paragraphs: [
        "We do not sell personal information. We may share information with:",
      ],
      bullets: [
        "Community administrators and authorized members when needed for community operations",
        "Service providers who help us host, secure, communicate, or process payments",
        "Authorities when required by law or to protect the safety of users and the public",
      ],
    },
    {
      id: "retention-security",
      title: "5. Retention and security",
      paragraphs: [
        "We retain information only as long as needed for the purposes described in this policy, legal obligations, and dispute resolution.",
        "We use administrative, technical, and organizational safeguards designed to protect information. No method of transmission or storage is completely secure, so we encourage strong account practices.",
      ],
    },
    {
      id: "your-choices",
      title: "6. Your choices",
      paragraphs: [
        "You may update account profile details in the product where available. Community administrators can manage member access for their communities.",
        "You may contact us to request access, correction, or deletion of personal information, subject to applicable law and community obligations.",
      ],
    },
    {
      id: "contact",
      title: "7. Contact",
      paragraphs: [
        "If you have privacy questions, contact us at hello@gohavena.com or support@gohavena.com.",
      ],
    },
  ] satisfies LegalSection[],
} as const;

export const termsAndConditions = {
  title: "Terms and Conditions",
  updatedAt: "August 31, 2026",
  intro:
    "These Terms and Conditions govern your access to and use of Havena. By using Havena, you agree to these terms.",
  sections: [
    {
      id: "acceptance",
      title: "1. Acceptance of terms",
      paragraphs: [
        "If you use Havena on behalf of a community, organization, or business, you confirm that you have authority to bind that entity to these terms.",
        "If you do not agree, do not use the service.",
      ],
    },
    {
      id: "accounts",
      title: "2. Accounts and communities",
      paragraphs: [
        "You sign in with your email and a one-time code. There is no password. You are responsible for the accuracy of information you provide and for keeping access to that email secure.",
        "Community administrators are responsible for inviting members, managing permissions, moderating community content, and complying with applicable laws.",
      ],
    },
    {
      id: "acceptable-use",
      title: "3. Acceptable use",
      paragraphs: ["You agree not to:"],
      bullets: [
        "Use Havena for unlawful, harmful, misleading, or abusive activity",
        "Harass others, post illegal content, or attempt to bypass security or access controls",
        "Interfere with platform availability, scrape data without permission, or misuse APIs",
        "Impersonate another person or misrepresent your affiliation with a community",
      ],
    },
    {
      id: "content",
      title: "4. Content and moderation",
      paragraphs: [
        "You retain rights to content you submit, and you grant Havena a license to host, display, and process that content as needed to operate the service.",
        "Community administrators may moderate content within their communities. Havena may remove content or restrict access that violates these terms or creates safety, legal, or operational risk.",
      ],
    },
    {
      id: "subscriptions",
      title: "5. Subscriptions and billing",
      paragraphs: [
        "Paid plans for community administrators are subject to the pricing, seat limits, and billing terms shown at purchase.",
        "Fees are generally non-refundable except where required by law or expressly stated otherwise.",
      ],
    },
    {
      id: "disclaimers",
      title: "6. Disclaimers and limitation of liability",
      paragraphs: [
        "Havena is provided on an “as is” and “as available” basis. We do not guarantee uninterrupted service or that community-generated content will always be accurate or appropriate.",
        "To the fullest extent permitted by law, Havena is not liable for indirect, incidental, special, consequential, or punitive damages arising from use of the service.",
      ],
    },
    {
      id: "termination",
      title: "7. Termination",
      paragraphs: [
        "You may stop using Havena at any time. We may suspend or terminate access if these terms are violated, if required for security or legal reasons, or if a subscription lapses.",
      ],
    },
    {
      id: "contact",
      title: "8. Contact",
      paragraphs: [
        "Questions about these terms can be sent to hello@gohavena.com or support@gohavena.com.",
      ],
    },
  ] satisfies LegalSection[],
} as const;
