import type { Metadata } from "next";
import { LegalPageShell } from "@/components/landing/LegalPageShell";
import { termsOfService } from "@/lib/landing/legal-content";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: termsOfService.description,
};

export default function TermsOfServicePage() {
  return <LegalPageShell document={termsOfService} />;
}
