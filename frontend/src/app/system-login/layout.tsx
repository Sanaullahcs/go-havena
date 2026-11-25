import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Platform sign in",
  robots: { index: false, follow: false },
};

export default function SystemLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
