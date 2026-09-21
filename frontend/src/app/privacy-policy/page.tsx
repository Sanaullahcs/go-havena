import type { Metadata } from "next";
import { LegalPageShell } from "@/components/landing/LegalPageShell";
import { privacyPolicy } from "@/lib/landing/legal-content";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: privacyPolicy.description,
};

export default function PrivacyPolicyPage() {
  return <LegalPageShell document={privacyPolicy} />;
}
