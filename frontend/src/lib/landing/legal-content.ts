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
  description: "How Havena collects, uses, and protects your information.",
  lastUpdated: "14 July 2026",
  sections: [
    {
      id: "introduction",
      title: "Introduction",
      paragraphs: [
        "Havena (“we”, “our”, or “us”) provides a community platform for neighborhoods, HOAs, and managed communities. This Privacy Policy explains what information we collect, how we use it, and the choices you have when you use our website, mobile app, and admin dashboard (collectively, the “Services”).",
        "By using Havena, you agree to the collection and use of information as described in this policy. If you do not agree, please do not use the Services.",
      ],
    },
    {
      id: "information-we-collect",
      title: "Information we collect",
      paragraphs: ["We collect information to operate verified, community-scoped accounts and to keep the platform secure."],
      bullets: [
        "Account details such as your name, email address, phone number, and role (resident, community admin, or system administrator).",
        "Profile and verification data, including community membership, region selection, and documents you upload for approval (for example, utility bills).",
        "Community activity such as posts, comments, event RSVPs, marketplace listings, wellness progress, and messages within your community.",
        "Contact form submissions from our public website, including your message and optional organization name.",
        "Technical data such as IP address, device type, browser, and usage logs used for security, fraud prevention, and product improvement.",
      ],
    },
    {
      id: "how-we-use",
      title: "How we use your information",
      paragraphs: ["We use personal information for the following purposes:"],
      bullets: [
        "Creating and managing your account, including OTP authentication and admin approval workflows.",
        "Delivering community features such as notices, events, feed content, marketplace, wellness courses, and alerts.",
        "Enforcing role-based access so content stays scoped to the correct region and community.",
        "Responding to support requests and contact form inquiries.",
        "Monitoring platform health, detecting abuse, and complying with legal obligations.",
      ],
    },
    {
      id: "sharing",
      title: "How we share information",
      paragraphs: [
        "Havena is not a public social network. Your profile and community content are visible to other members and authorized admins within your community according to your role and community settings.",
        "We do not sell your personal information. We may share data with service providers who help us host, secure, or operate the platform (under confidentiality obligations), or when required by law.",
      ],
    },
    {
      id: "retention",
      title: "Data retention",
      paragraphs: [
        "We retain account and community data for as long as your membership is active or as needed to provide the Services. Verification documents and admin records may be kept for a reasonable period to support audits, disputes, and compliance.",
        "You may request deletion of your account subject to community admin policies and legal requirements.",
      ],
    },
    {
      id: "security",
      title: "Security",
      paragraphs: [
        "We use industry-standard safeguards including encrypted connections, access controls, and role-based permissions. No method of transmission or storage is completely secure, and we cannot guarantee absolute security.",
      ],
    },
    {
      id: "your-rights",
      title: "Your choices & rights",
      paragraphs: ["Depending on your location, you may have rights to:"],
      bullets: [
        "Access, correct, or update your profile information in the app or dashboard.",
        "Request a copy or deletion of your personal data, where applicable.",
        "Opt out of non-essential communications.",
        "Contact us with privacy questions using the details below.",
      ],
    },
    {
      id: "children",
      title: "Children",
      paragraphs: [
        "Havena is intended for community members aged 13 and older. We do not knowingly collect personal information from children under 13 without appropriate consent.",
      ],
    },
    {
      id: "changes",
      title: "Changes to this policy",
      paragraphs: [
        "We may update this Privacy Policy from time to time. We will post the revised version on this page and update the “Last updated” date. Continued use of the Services after changes means you accept the updated policy.",
      ],
    },
    {
      id: "contact",
      title: "Contact us",
      paragraphs: [
        "For privacy-related questions, contact us through the Contact form on our website or email your community administrator for account-specific requests.",
      ],
    },
  ],
};

export const termsOfService: LegalDocument = {
  title: "Terms of Service",
  description: "Rules and conditions for using the Havena platform.",
  lastUpdated: "14 July 2026",
  sections: [
    {
      id: "agreement",
      title: "Agreement to terms",
      paragraphs: [
        "These Terms of Service (“Terms”) govern your access to and use of Havena’s website, mobile application, and admin dashboard. By creating an account or using the Services, you agree to these Terms.",
        "If you use Havena on behalf of a community or organization, you represent that you have authority to bind that organization to these Terms.",
      ],
    },
    {
      id: "eligibility",
      title: "Eligibility & accounts",
      paragraphs: ["To use Havena you must:"],
      bullets: [
        "Be invited to or approved for a specific community, or hold an authorized admin role.",
        "Provide accurate registration information and keep your account credentials secure.",
        "Complete any verification steps required by your community (such as profile review or document upload).",
        "Use OTP login and other authentication features as provided; you are responsible for activity on your account.",
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
      ],
    },
    {
      id: "content",
      title: "Your content",
      paragraphs: [
        "You retain ownership of content you submit (posts, listings, messages, documents). By posting on Havena, you grant us a limited license to host, display, and distribute that content within the Services and to your intended community audience.",
        "Community admins may moderate, remove, or restrict content according to community guidelines and applicable law.",
      ],
    },
    {
      id: "admin-roles",
      title: "Admin & system roles",
      paragraphs: [
        "Community admins and system administrators have additional tools to manage members, approve access, publish notices, and view analytics. Admins must use those tools responsibly and in accordance with community policies and privacy laws.",
        "We may suspend or revoke admin access if these Terms are violated or if required to protect users or the platform.",
      ],
    },
    {
      id: "marketplace-wellness",
      title: "Marketplace & wellness features",
      paragraphs: [
        "Marketplace listings, deals, and wellness content are provided for community convenience. Havena does not guarantee the quality, safety, or legality of third-party offers. Transactions and participation are at your own discretion.",
      ],
    },
    {
      id: "termination",
      title: "Suspension & termination",
      paragraphs: [
        "We or your community admin may suspend or terminate access if you breach these Terms, community rules, or if continued access poses a risk to others. You may stop using the Services at any time.",
        "Sections that by nature should survive termination (including limitations of liability and dispute terms) will remain in effect.",
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
        "We may modify these Terms at any time. Material changes will be posted on this page with an updated date. Your continued use after changes constitutes acceptance of the revised Terms.",
      ],
    },
    {
      id: "contact-terms",
      title: "Contact",
      paragraphs: [
        "Questions about these Terms can be sent through the Contact section on our website or to your community administrator.",
      ],
    },
  ],
};
