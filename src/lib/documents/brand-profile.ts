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

export function getDocumentBrandProfile(
  brandCode: string,
  settings?: Pick<
    BrandSettings,
    "contact_email" | "contact_phone" | "brand_website_url" | "receipt_header"
  >,
): DocumentBrandProfile | null {
  const code = brandCode.trim().toUpperCase();
  if (code !== "BR-2") return null;

  const base = { ...CUBIG_FURNITURE_PROFILE };
  if (settings?.contact_email?.trim()) {
    base.email = settings.contact_email.trim();
  }
  if (settings?.contact_phone?.trim()) {
    base.phone = settings.contact_phone.trim();
  }
  if (settings?.brand_website_url?.trim()) {
    base.websiteUrl = settings.brand_website_url.trim();
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
