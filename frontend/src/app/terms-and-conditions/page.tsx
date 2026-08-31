import type { Metadata } from "next";
import { LegalPageShell } from "@/components/marketing/legal-page-shell";
import { termsAndConditions } from "@/lib/marketing/legal";

export const metadata: Metadata = {
  title: termsAndConditions.title,
  description: termsAndConditions.intro,
};

export default function TermsAndConditionsPage() {
  return (
    <LegalPageShell
      title={termsAndConditions.title}
      updatedAt={termsAndConditions.updatedAt}
      intro={termsAndConditions.intro}
      sections={termsAndConditions.sections}
    />
  );
}
