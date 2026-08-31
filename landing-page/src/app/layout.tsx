import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-inter",
});

const siteUrl = "https://havena.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Havena — Know your neighbors. Love where you live.",
    template: "%s · Havena",
  },
  description:
    "Havena is the easiest way to discover what's happening on your street. Share updates, join local events, support neighborhood businesses, and stay connected to the people next door.",
  keywords: [
    "Havena",
    "hyperlocal community",
    "neighborhood app",
    "local events",
    "neighbors",
    "community",
  ],
  applicationName: "Havena",
  authors: [{ name: "Havena" }],
  creator: "Havena",
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Havena",
    title: "Havena — Know your neighbors. Love where you live.",
    description:
      "Discover what's happening on your street. Calm, private, and made for the people next door.",
    images: [
      {
        url: "/main-logo.png",
        width: 1200,
        height: 630,
        alt: "Havena",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Havena — Know your neighbors.",
    description:
      "Discover what's happening on your street. Calm, private, and made for the people next door.",
    images: ["/main-logo.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.png?v=20260827c", type: "image/png" },
    ],
    apple: [{ url: "/app-icon.png?v=20260827c" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#14B8A6",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${poppins.variable} ${poppins.className}`}>
      <body className={`${poppins.className} min-h-screen bg-white text-ink-primary antialiased`}>
        {children}
      </body>
    </html>
  );
}
