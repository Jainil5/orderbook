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

/**
 * The letterhead each demo brand prints on a bill or quotation: name, mark,
 * address block, contact line and the terms that sit under the signature.
 * Adding a brand is one entry here — nothing else in the document pipeline
 * knows brand codes.
 *
 * The demo data carries no registration numbers, so neither does this: a
 * printed document may show a tax percentage and a city, never a made-up GSTIN.
 */
const DOCUMENT_BRAND_PROFILES: Record<string, DocumentBrandProfile> = {
  "BR-1": {
    legalName: "Brewery Cafe",
    tagline: "Slow coffee, fast service",
    logoPath: "/brands/brewery-cafe-logo.png",
    // The in-app site lives at `/site/BR-1`, which has no business being
    // printed; `.example` is reserved, so this cannot point at a real shop.
    websiteUrl: "https://brewerycafe.example",
    email: "hello@brewery-cafe.demo",
    phone: "+91 98765 43210",
    addressLines: ["10th Main Road, Indiranagar", "Bengaluru 560038"],
    accentColor: [52, 30, 20] as const,
    quotationTerms:
      "Prices are today's counter menu and hold for 3 days. Beans, milk and pastry are bought batch by batch, so a large order is re-checked before it is confirmed. Nothing is payable until the order is placed.",
    invoiceTerms:
      "Counter tax invoice — the goods listed were handed over at the till. Payment is due in full before you leave; tax is charged at the counter rate and split equally between CGST and SGST. Unused items are refunded the same day against this bill.",
  },
  "BR-2": {
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
  },
};

export function getDocumentBrandProfile(
  brandCode: string,
  settings?: Pick<
    BrandSettings,
    "contact_email" | "contact_phone" | "brand_website_url" | "receipt_header"
  >,
): DocumentBrandProfile | null {
  const code = brandCode.trim().toUpperCase();
  if (!Object.hasOwn(DOCUMENT_BRAND_PROFILES, code)) return null;
  const base = DOCUMENT_BRAND_PROFILES[code];

  const profile = { ...base };
  if (settings?.contact_email?.trim()) {
    profile.email = settings.contact_email.trim();
  }
  if (settings?.contact_phone?.trim()) {
    profile.phone = settings.contact_phone.trim();
  }
  // Only an absolute URL belongs on a printed document; the demo workspace
  // points brand_website_url at the in-app site (`/site/BR-1`, `/site/BR-2`).
  if (settings?.brand_website_url?.trim().startsWith("http")) {
    profile.websiteUrl = settings.brand_website_url.trim();
  }
  if (settings?.receipt_header?.trim()) {
    profile.legalName = settings.receipt_header.trim();
  }
  return profile;
}

export async function loadDocumentLogoDataUrl(
  logoPath: string,
): Promise<string | null> {
  const { loadImageDataUrl } = await import("@/lib/documents/load-image-data-url");
  return loadImageDataUrl(logoPath);
}
