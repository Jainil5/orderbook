import type { BrandSettings } from "@/types/database";

export type DocumentBrandProfile = {
  legalName: string;
  tagline: string;
  logoPath: string;
  websiteUrl: string;
  email: string;
  phone: string;
  addressLines: string[];
  /** RGB for PDF accents */
  accentColor: readonly [number, number, number];
  quotationTerms?: string;
  invoiceTerms?: string;
};

const BREWERY_CAFE_PROFILE: DocumentBrandProfile = {
  legalName: "Brewery Cafe",
  tagline: "Bread, coffee & the unhurried hour · Surat",
  logoPath: "/brands/brewery-cafe-logo.png",
  websiteUrl: "https://brewery-cafe.demo",
  email: "hello@brewery-cafe.demo",
  phone: "+91 98765 43210",
  addressLines: [
    "Shop 4, Sea View Arcade, 5th Road, Adajan",
    "Surat, Gujarat 395007, India",
  ],
  accentColor: [192, 63, 28] as const,
  invoiceTerms:
    "GST bill of supply. Payment due at the counter or on delivery. Orders are cancelled free of charge before preparation starts.",
};

const CUBIG_FURNITURE_PROFILE: DocumentBrandProfile = {
  legalName: "Cubig Furniture",
  tagline: "Modular office desks, chairs & workstations · Surat",
  logoPath: "/brands/cubig-furniture-logo.png",
  websiteUrl: "https://cubigfurniture.com/",
  email: "info@cubigfurniture.com",
  phone: "+91 93139 50917",
  addressLines: [
    "48–49, Jay Hanuman Estate, Chosath Jogani Mandir",
    "Udhna Magdalla Road, Surat, Gujarat, India",
  ],
  accentColor: [15, 58, 90] as const,
  quotationTerms:
    "Quotation valid for 15 days unless stated otherwise. Prices in INR; GST extra as applicable. Delivery and installation quoted separately when required.",
  invoiceTerms:
    "GST tax invoice. Payment as per agreed terms. Goods once sold will be subject to company warranty policy.",
};

/** Issuer detail a bill or quotation prints, keyed by the brand's own code.
 *  A brand not listed here bills with the plain fallback layout. */
const DOCUMENT_PROFILES: Record<string, DocumentBrandProfile> = {
  "BR-1": BREWERY_CAFE_PROFILE,
  "BR-2": CUBIG_FURNITURE_PROFILE,
};

export function getDocumentBrandProfile(
  brandCode: string,
  settings?: Pick<
    BrandSettings,
    "contact_email" | "contact_phone" | "brand_website_url" | "receipt_header"
  >,
): DocumentBrandProfile | null {
  const code = brandCode.trim().toUpperCase();
  const profile = DOCUMENT_PROFILES[code];
  if (!profile) return null;

  const base = { ...profile };
  if (settings?.contact_email?.trim()) {
    base.email = settings.contact_email.trim();
  }
  if (settings?.contact_phone?.trim()) {
    base.phone = settings.contact_phone.trim();
  }
  // Only an absolute URL belongs on a printed bill: this field also holds
  // in-app paths like the website's own `/menu`.
  if (/^https?:\/\//i.test(settings?.brand_website_url?.trim() ?? "")) {
    base.websiteUrl = settings!.brand_website_url!.trim();
  }
  if (settings?.receipt_header?.trim()) {
    base.legalName = settings.receipt_header.trim();
  }
  return base;
}

export async function loadDocumentLogoDataUrl(
  logoPath: string,
): Promise<string | null> {
  const { loadImageDataUrl } = await import("@/lib/documents/load-image-data-url");
  return loadImageDataUrl(logoPath);
}
