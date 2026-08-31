import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import { APP_NAME } from "@/lib/constants";
import { StripTrailingSlash } from "@/components/shared/strip-trailing-slash";

/** Single Havena UI face — wired to existing --font-inter / display / brand vars. */
const nunito = Nunito({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-nunito",
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: "Havena community & wellness platform",
  icons: {
    icon: [{ url: "/favicon.png?v=20260827c", type: "image/png" }],
    apple: [{ url: "/app-icon.png?v=20260827c" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full overflow-x-hidden" suppressHydrationWarning>
        <StripTrailingSlash />
        {children}
      </body>
    </html>
  );
}
