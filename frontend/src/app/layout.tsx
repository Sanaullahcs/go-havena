import type { Metadata } from "next";
import { DM_Sans, Plus_Jakarta_Sans, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { APP_NAME } from "@/lib/constants";
import { StripTrailingSlash } from "@/components/shared/strip-trailing-slash";

const sans = DM_Sans({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const display = Plus_Jakarta_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const brand = Source_Serif_4({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: "Havena community & wellness platform",
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png" }],
    apple: [{ url: "/app-icon.png" }],
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
      className={`${sans.variable} ${display.variable} ${brand.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full overflow-x-hidden" suppressHydrationWarning>
        <StripTrailingSlash />
        {children}
      </body>
    </html>
  );
}
