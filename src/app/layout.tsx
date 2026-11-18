import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { CardGlow } from "@/components/effects/card-glow";
import {
  resolveInitialTheme,
  THEME_COOKIE,
  THEME_INIT_SCRIPT,
} from "@/lib/theme";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz"],
  display: "swap",
});

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

export const metadata: Metadata = {
  title: "OrderBook — POS, billing & analytics for every business",
  description:
    "OrderBook is a multi-business order management and POS workspace: billing, orders, catalog, quotations, offers, and live analytics for breweries, furniture studios, and more.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#06120d",
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
      className={`${bricolage.variable} ${instrument.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <CardGlow />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
