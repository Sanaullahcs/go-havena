import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const siteUrl = "https://neighborlink.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "NeighborLink — Know your neighbors. Love where you live.",
    template: "%s · NeighborLink",
  },
  description:
    "NeighborLink is the easiest way to discover what's happening on your street. Share updates, join local events, support neighborhood businesses, and stay connected to the people next door.",
  keywords: [
    "NeighborLink",
    "hyperlocal community",
    "neighborhood app",
    "local events",
    "neighbors",
    "community",
  ],
  applicationName: "NeighborLink",
  authors: [{ name: "NeighborLink" }],
  creator: "NeighborLink",
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "NeighborLink",
    title: "NeighborLink — Know your neighbors. Love where you live.",
    description:
      "Discover what's happening on your street. Calm, private, and made for the people next door.",
    images: [
      {
        url: "/main-logo.png",
        width: 1200,
        height: 630,
        alt: "NeighborLink",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NeighborLink — Know your neighbors.",
    description:
      "Discover what's happening on your street. Calm, private, and made for the people next door.",
    images: ["/main-logo.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
    ],
    apple: [{ url: "/app-icon.png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#4338ca",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-white text-ink-primary antialiased">
        {children}
      </body>
    </html>
  );
}
