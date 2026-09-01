import type { CSSProperties } from "react";
import type { Metadata } from "next";
import "./globals.css";
import { APP_NAME } from "@/lib/constants";
import { StripTrailingSlash } from "@/components/shared/strip-trailing-slash";

const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@400;500;600;700;800&family=Quicksand:wght@500;600;700&display=swap";

const fontVars = {
  "--font-inter": "Inter, ui-sans-serif, system-ui, sans-serif",
  "--font-havena": "Poppins, ui-sans-serif, system-ui, sans-serif",
  "--font-wordmark": "Quicksand, sans-serif",
} as CSSProperties;

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
    <html lang="en" className="h-full antialiased" style={fontVars} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href={GOOGLE_FONTS_HREF} rel="stylesheet" />
      </head>
      <body className="min-h-full overflow-x-hidden" suppressHydrationWarning>
        <StripTrailingSlash />
        {children}
      </body>
    </html>
  );
}
