import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { EnvConfigBanner } from "@/components/env-config-banner";
import { CardGlow } from "@/components/effects/card-glow";
import {
  resolveInitialTheme,
  THEME_COOKIE,
  THEME_INIT_SCRIPT,
} from "@/lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OrderBook — WebsiteIn",
  description: "Multi-business order management and POS workspace",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
