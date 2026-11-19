import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getDocumentBrandProfile } from "./brand-profile";

const ROOT = resolve(import.meta.dirname, "../../..");

describe("getDocumentBrandProfile", () => {
  it("gives the cafe a printed letterhead of its own", () => {
    const issuer = getDocumentBrandProfile("BR-1");
    expect(issuer).not.toBeNull();
    expect(issuer?.legalName).toBe("Brewery Cafe");
    expect(issuer?.tagline).toBe("Slow coffee, fast service");
    expect(issuer?.logoPath).toBe("/brands/brewery-cafe-logo.png");
    expect(issuer?.addressLines).toEqual([
      "10th Main Road, Indiranagar",
      "Bengaluru 560038",
    ]);
    expect(issuer?.email).toBe("hello@brewery-cafe.demo");
    expect(issuer?.phone).toBe("+91 98765 43210");
    // A roast brown, not the furniture brand's blue.
    expect(issuer?.accentColor).not.toEqual([15, 58, 90]);
    expect(issuer?.invoiceTerms).toContain("Counter tax invoice");
    expect(issuer?.quotationTerms).toContain("3 days");
    // A demo shop gets a reserved domain and no invented registration number.
    expect(issuer?.websiteUrl).toBe("https://brewerycafe.example");
    expect(issuer?.websiteUrl).not.toContain("/site/");
    expect(`${issuer?.invoiceTerms}${issuer?.quotationTerms}`).not.toContain(
      "GSTIN",
    );
  });

  it("still knows the furniture brand", () => {
    expect(getDocumentBrandProfile("br-2")?.legalName).toBe("Cubig Furniture");
    expect(getDocumentBrandProfile("  BR-2  ")?.logoPath).toBe(
      "/brands/cubig-furniture-logo.png",
    );
  });

  it("lets brand settings override the printed contact block", () => {
    const issuer = getDocumentBrandProfile("BR-1", {
      contact_email: " owner@brewery-cafe.demo ",
      contact_phone: "+91 90000 11111",
      receipt_header: "Brewery Cafe · Indiranagar",
      brand_website_url: "https://cafe.example/",
    });
    expect(issuer?.email).toBe("owner@brewery-cafe.demo");
    expect(issuer?.phone).toBe("+91 90000 11111");
    expect(issuer?.legalName).toBe("Brewery Cafe · Indiranagar");
    expect(issuer?.websiteUrl).toBe("https://cafe.example/");
  });

  it("keeps the in-app site path off paper and empty settings off the letterhead", () => {
    const inApp = getDocumentBrandProfile("BR-1", {
      contact_email: "",
      contact_phone: "   ",
      brand_website_url: "/site/BR-1",
      receipt_header: null,
    });
    expect(inApp?.websiteUrl).toBe("https://brewerycafe.example");
    expect(inApp?.email).toBe("hello@brewery-cafe.demo");
    expect(inApp?.phone).toBe("+91 98765 43210");
    expect(inApp?.legalName).toBe("Brewery Cafe");

    const bare = getDocumentBrandProfile("BR-1", {
      contact_email: undefined,
      contact_phone: undefined,
      brand_website_url: undefined,
      receipt_header: undefined,
    });
    expect(bare).toEqual(getDocumentBrandProfile("BR-1"));
  });

  it("returns nothing for a brand with no letterhead", () => {
    expect(getDocumentBrandProfile("BR-3")).toBeNull();
    expect(getDocumentBrandProfile("")).toBeNull();
    // The registry must not answer with an inherited object member.
    expect(getDocumentBrandProfile("constructor")).toBeNull();
  });

  it("ships every registered logo as a real PNG, ink included", () => {
    for (const code of ["BR-1", "BR-2"]) {
      const logoPath = getDocumentBrandProfile(code)?.logoPath ?? "";
      expect(logoPath, code).toBeTruthy();
      const bytes = readFileSync(resolve(ROOT, "public", logoPath.slice(1)));
      expect(bytes.length, logoPath).toBeGreaterThan(0);
      expect(bytes.subarray(0, 8).toString("hex"), logoPath).toBe(
        "89504e470d0a1a0a",
      );
    }
  });
});
