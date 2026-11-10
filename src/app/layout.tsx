import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Fraunces, Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { EnvConfigBanner } from "@/components/env-config-banner";
import { CardGlow } from "@/components/effects/card-glow";
import {
  resolveInitialTheme,
  THEME_COOKIE,
  THEME_INIT_SCRIPT,
} from "@/lib/theme";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OrderBook — POS, billing & analytics for every business",
  description:
    "OrderBook is a multi-business order management and POS workspace: billing, orders, catalog, quotations, offers, and live analytics for breweries, furniture studios, and more.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export default async function RootLayout({
  children,
}: LayoutProps<"/">) {
  const theme = resolveInitialTheme(
    (await cookies()).get(THEME_COOKIE)?.value,
    null,
  );
  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${inter.variable} ${fraunces.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <EnvConfigBanner />
        <CardGlow />
        {children}
      </body>
    </html>
  );
}
