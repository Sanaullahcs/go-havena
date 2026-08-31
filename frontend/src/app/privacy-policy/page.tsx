import type { Metadata } from "next";
import { LegalPageShell } from "@/components/marketing/legal-page-shell";
import { privacyPolicy } from "@/lib/marketing/legal";

export const metadata: Metadata = {
  title: privacyPolicy.title,
  description: privacyPolicy.intro,
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell
      title={privacyPolicy.title}
      updatedAt={privacyPolicy.updatedAt}
      intro={privacyPolicy.intro}
      sections={privacyPolicy.sections}
    />
  );
}
