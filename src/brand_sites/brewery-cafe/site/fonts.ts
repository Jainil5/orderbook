import localFont from "next/font/local";

/**
 * The three faces the cafe is typed in. `next/font/local` paths resolve
 * relative to this file, so the woff2 files live beside it in site/fonts/.
 */
export const bcSans = localFont({
  src: "./fonts/inter-latin.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--bc-sans",
  display: "swap",
});

export const bcSerif = localFont({
  src: "./fonts/playfair-display-latin.woff2",
  weight: "400 900",
  style: "normal",
  variable: "--bc-serif",
  display: "swap",
});

export const bcDisplay = localFont({
  src: "./fonts/archivo-latin.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--bc-display",
  display: "swap",
});

export const bcFontVars = `${bcSans.variable} ${bcSerif.variable} ${bcDisplay.variable}`;
