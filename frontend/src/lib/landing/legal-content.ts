export type LegalSection = {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

export type LegalDocument = {
  title: string;
  description: string;
  lastUpdated: string;
  sections: LegalSection[];
};

export const privacyPolicy: LegalDocument = {
  title: "Privacy Policy",
  description: "How Havena collects, uses, and protects your information on the website, admin dashboard, and mobile apps.",
  lastUpdated: "31 August 2026",
  sections: [
    {
      id: "introduction",
      title: "Introduction",
      paragraphs: [
        "Havena (“we”, “our”, or “us”) provides a private community platform for neighborhoods, HOAs, and managed communities. This Privacy Policy explains what information we collect, how we use it, and the choices you have when you use our website, iOS and Android apps, and admin dashboard (collectively, the “Services”).",
        "By using Havena, you agree to this policy. If you do not agree, please do not use the Services.",
        "Contact: hello@gohavena.com · Website: https://gohavena.com",
      ],
    },
    {
      id: "information-we-collect",
      title: "Information we collect",
      paragraphs: [
        "We collect only what we need to run verified, community-scoped accounts. We do not sell personal information and we do not use data for advertising or tracking.",
      ],
      bullets: [
        "Account details: name, email address (used for OTP sign-in), optional phone number, and role (resident, community admin, or system administrator).",
        "Profile and verification data: community membership, unit or residence type, region, bio, and documents you upload for approval (for example, a utility bill).",
        "Photos you choose to upload: profile photo, feed posts, marketplace listings, and similar community media. Camera or photo-library access is used only when you pick or take a photo. We do not scan your full gallery.",
        "User content: posts, comments, notices, event RSVPs, amenity bookings, marketplace listings, deals, messages, wellness progress, and community documents you submit.",
        "Device identifiers used for optional push notifications (for example, a device push token). You can turn push notifications off in Settings.",
        "Technical data such as IP address, device type, browser or app version, and usage logs used for security, fraud prevention, and keeping the Services working.",
        "Contact form submissions from our public website, including your message and optional organization name.",
      ],
    },
    {
      id: "how-we-use",
      title: "How we use your information",
      paragraphs: ["We use personal information only for app functionality and account management:"],
      bullets: [
        "Creating and managing your account, including email OTP authentication and community approval.",
        "Delivering community features such as notices, events, the neighbor feed, marketplace, amenity booking, messages, and wellness content.",
        "Showing your profile and content to other approved members and admins in your community.",
        "Sending optional push or email notifications you enable.",
        "Responding to support requests and contact form inquiries.",
        "Protecting the platform, detecting abuse, and complying with law.",
      ],
    },
    {
      id: "sharing",
      title: "How we share information",
      paragraphs: [
        "Havena is not a public social network. Your profile and community content are visible to other members and authorized admins within your community according to your role and community settings.",
        "We do not sell your personal information. We do not share it with advertisers or data brokers.",
        "We may use service providers who host, secure, or operate the Services (for example, cloud hosting and push-notification delivery) under confidentiality obligations, and only to provide Havena to you.",
        "We may disclose information when required by law or to protect users and the platform.",
      ],
    },
    {
      id: "permissions",
      title: "Device permissions",
      paragraphs: ["The mobile apps may ask for these permissions only when a feature needs them:"],
      bullets: [
        "Camera — scan an invite QR code or take a photo you choose to upload.",
        "Photos / media — choose a profile, feed, or listing photo from your library.",
        "Notifications — optional alerts about notices, messages, and community activity.",
        "Face ID / fingerprint — optional, to unlock the app after you have already signed in.",
      ],
    },
    {
      id: "retention",
      title: "Data retention",
      paragraphs: [
        "We retain account and community data for as long as your membership is active or as needed to provide the Services. Verification documents and admin records may be kept for a reasonable period for audits, disputes, and compliance.",
        "When you delete your account we deactivate it, revoke sign-in tokens, and stop using the account for the Services. Some records may remain where we must keep them for legal, security, or community-admin reasons.",
      ],
    },
    {
      id: "deletion",
      title: "Account deletion",
      paragraphs: [
        "You can delete your Havena account at any time from the mobile app: Profile → Settings → Delete Account. That permanently deletes the account and signs you out. You may create a new account later with the same email address.",
        "You may also email hello@gohavena.com and ask us to delete your account. We will complete the request unless we must retain specific records to comply with law or resolve a dispute.",
      ],
    },
    {
      id: "security",
      title: "Security",
      paragraphs: [
        "We use industry-standard safeguards including encrypted connections (HTTPS), access controls, and role-based permissions. No method of transmission or storage is completely secure, and we cannot guarantee absolute security.",
      ],
    },
    {
      id: "your-rights",
      title: "Your choices & rights",
      paragraphs: ["Depending on your location, you may have rights to:"],
      bullets: [
        "Access, correct, or update your profile in the app or dashboard.",
        "Request a copy or deletion of your personal data.",
        "Turn off push or email notifications in Settings.",
        "Contact us at hello@gohavena.com with privacy questions.",
      ],
    },
    {
      id: "children",
      title: "Children",
      paragraphs: [
        "Havena is intended for community members aged 13 and older. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has created an account, contact hello@gohavena.com and we will delete it.",
      ],
    },
    {
      id: "changes",
      title: "Changes to this policy",
      paragraphs: [
        "We may update this Privacy Policy from time to time. We will post the revised version at https://gohavena.com/privacy-policy and update the “Last updated” date. Continued use of the Services after changes means you accept the updated policy.",
      ],
    },
    {
      id: "contact",
      title: "Contact us",
      paragraphs: [
        "Privacy questions: hello@gohavena.com",
        "You can also use the Contact form on https://gohavena.com or write to your community administrator for account-specific requests.",
      ],
    },
  ],
};

export const termsOfService: LegalDocument = {
  title: "Terms of Service",
  description: "Rules for using the Havena website, admin dashboard, and iOS/Android apps.",
  lastUpdated: "31 August 2026",
  sections: [
    {
      id: "agreement",
      title: "Agreement to terms",
      paragraphs: [
        "These Terms of Service (“Terms”) govern your access to and use of Havena’s website, mobile applications, and admin dashboard. By creating an account or using the Services, you agree to these Terms and to our Privacy Policy at https://gohavena.com/privacy-policy.",
        "If you use Havena on behalf of a community or organization, you represent that you have authority to bind that organization to these Terms.",
      ],
    },
    {
      id: "eligibility",
      title: "Eligibility & accounts",
      paragraphs: ["To use Havena you must:"],
      bullets: [
        "Be at least 13 years old.",
        "Be invited to or approved for a specific community, or hold an authorized admin role.",
        "Provide accurate registration information and keep your account secure.",
        "Complete any verification steps required by your community (such as profile review or document upload).",
        "Use email OTP (or other authentication we provide). You are responsible for activity on your account.",
      ],
    },
    {
      id: "community-rules",
      title: "Community standards",
      paragraphs: ["You agree not to misuse the platform. Prohibited conduct includes:"],
      bullets: [
        "Harassment, hate speech, threats, or content that violates applicable law.",
        "Posting spam, misleading listings, or unauthorized commercial solicitation.",
        "Impersonating another person or misrepresenting your affiliation with a community.",
        "Attempting to access data, communities, or admin tools without authorization.",
        "Uploading malware or interfering with the security or performance of the Services.",
        "Using Havena to collect personal data from other members without their permission.",
      ],
    },
    {
      id: "content",
      title: "Your content",
      paragraphs: [
        "You retain ownership of content you submit (posts, photos, listings, messages, documents). By posting on Havena, you grant us a limited license to host, display, and distribute that content within the Services and to your intended community audience.",
        "You represent that you have the rights to upload the photos and files you share.",
        "Community admins may moderate, remove, or restrict content according to community guidelines and applicable law. Other members may report content.",
      ],
    },
    {
      id: "admin-roles",
      title: "Admin & system roles",
      paragraphs: [
        "Community admins and system administrators have additional tools to manage members, approve access, publish notices, and view community activity. Admins must use those tools responsibly and in accordance with community policies and privacy laws.",
        "We may suspend or revoke admin access if these Terms are violated or if required to protect users or the platform.",
      ],
    },
    {
      id: "marketplace-wellness",
      title: "Marketplace, amenities & wellness",
      paragraphs: [
        "Marketplace listings, deals, amenity bookings, and wellness content are provided for community convenience. Havena does not guarantee the quality, safety, or legality of third-party offers or resident-to-resident transactions. Participation is at your own discretion.",
      ],
    },
    {
      id: "subscriptions",
      title: "Subscriptions & billing",
      paragraphs: [
        "Community subscriptions, where offered, are billed to the community administrator according to the plan selected on the website. Fees, trials, and cancellations are described at checkout and in the admin billing screens.",
        "Unless required by law, fees are non-refundable once a billing period has started.",
      ],
    },
    {
      id: "termination",
      title: "Suspension, deletion & termination",
      paragraphs: [
        "You may stop using the Services at any time. You may delete your account in the mobile app under Profile → Settings → Delete Account, or by emailing hello@gohavena.com.",
        "We or your community admin may suspend or terminate access if you breach these Terms, community rules, or if continued access poses a risk to others.",
        "Sections that by nature should survive termination (including limitations of liability) will remain in effect.",
      ],
    },
    {
      id: "disclaimers",
      title: "Disclaimers",
      paragraphs: [
        "The Services are provided “as is” and “as available” without warranties of any kind, whether express or implied. We do not warrant uninterrupted or error-free operation.",
      ],
    },
    {
      id: "liability",
      title: "Limitation of liability",
      paragraphs: [
        "To the fullest extent permitted by law, Havena and its affiliates will not be liable for indirect, incidental, special, consequential, or punitive damages arising from your use of the Services. Our total liability for any claim related to the Services is limited to the amount you paid us in the twelve months before the claim, or one hundred US dollars if no fees were paid.",
      ],
    },
    {
      id: "changes-terms",
      title: "Changes to these terms",
      paragraphs: [
        "We may modify these Terms at any time. The current version is posted at https://gohavena.com/terms-of-service with an updated date. Your continued use after changes constitutes acceptance of the revised Terms.",
      ],
    },
    {
      id: "contact-terms",
      title: "Contact",
      paragraphs: [
        "Questions about these Terms: hello@gohavena.com or https://gohavena.com",
      ],
    },
  ],
};
