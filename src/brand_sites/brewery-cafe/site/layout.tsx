import type { ReactNode } from "react";
import "../styles/brewery-cafe.css";
import { bcFontVars } from "./fonts";

/**
 * The brand site keeps its own typefaces and tokens, scoped to `.brewery-cafe`
 * in stylesheet, so the workspace and the site never borrow each other's look.
 */
export default function BrandSiteLayout({ children }: { children: ReactNode }) {
  return <div className={bcFontVars}>{children}</div>;
}
