import { afterEach, describe, expect, it, vi } from "vitest";
import { billDocumentFilename } from "./build-bill-document";
import {
  billHtmlTitle,
  escapeHtml,
  renderBillHtml,
} from "./render-bill-html";
import { openBillHtml } from "./open-bill-html";
import type { BillDocument } from "./types";
import type { DocumentBrandProfile } from "./brand-profile";

const ISSUER: DocumentBrandProfile = {
  legalName: "Cubig Furniture",
  tagline: "Modular office desks, chairs & workstations · Surat",
  logoPath: "/brands/cubig-furniture-logo.png",
  websiteUrl: "https://cubigfurniture.com/",
  email: "info@cubigfurniture.com",
  phone: "+91 93139 50917",
  addressLines: ["48–49, Jay Hanuman Estate", "Udhna Magdalla Road, Surat"],
  accentColor: [15, 58, 90] as const,
  quotationTerms: "Quotation valid for 15 days unless stated otherwise.",
  invoiceTerms: "GST tax invoice. Payment as per agreed terms.",
};

/** One flat row of the details block, as the sheet prints it. */
function detailRow(label: string, value: string): string {
  return `<div class="row"><dt>${label}</dt><dd>${value}</dd></div>`;
}

function doc(overrides: Partial<BillDocument> = {}): BillDocument {
  return {
    kind: "quotation",
    orderNumber: "CF-Q-1",
    brandName: "Cubig Furniture",
    brandCode: "BR-2",
    issuer: ISSUER,
    receiptHeader: null,
    receiptFooter: null,
    currencyCode: "INR",
    taxRatePercent: 18,
    customerName: "Asha Sheth",
    customerPhone: "9876500011",
    notes: null,
    paymentMethod: null,
    createdAt: "2026-11-11T10:00:00.000Z",
    lines: [
      {
        name: "Cubic Workstation 1800",
        quantity: 2,
        unit: "unit",
        listUnitPrice: 24500,
        lineDiscount: 2000,
        lineTotal: 47000,
        sku: "CB-WS-1800",
        description: "Three panels, cable tray, felt screen",
        imageUrl: "/demo/products/BR-2/CB-WS-1800.jpg",
      },
      {
        name: "Swivel Chair",
        quantity: 4,
        unit: "piece",
        listUnitPrice: 4500,
        lineDiscount: 0,
        lineTotal: 18000,
        imageUrl: null,
      },
    ],
    listSubtotal: 65000,
    productDiscountTotal: 2000,
    orderDiscountAmount: 0,
    offerDiscountAmount: 0,
    taxableSubtotal: 63000,
    taxTotal: 11340,
    feesTotal: 0,
    grandTotal: 74340,
    depositPercent: 40,
    ...overrides,
  };
}

describe("escapeHtml", () => {
  it("escapes every character that could close a tag or an attribute", () => {
    expect(escapeHtml(`<img src="x" onerror='y'>&'`)).toBe(
      "&lt;img src=&quot;x&quot; onerror=&#39;y&#39;&gt;&amp;&#39;",
    );
  });
});

describe("renderBillHtml", () => {
  it("is one complete, self-contained document", () => {
    const html = renderBillHtml(doc());
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain(
      `<title>${billHtmlTitle(doc())}</title>`,
    );
    expect(html).toContain("<style>");
    // No scripts, no remote CSS, no remote images — the file must render
    // wherever it is opened, including from a downloads folder.
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/src="(https?:)?\/\//);
    expect(html).not.toMatch(/href="(https?:)?\/\//);
  });

  it("titles a bill and a quotation by kind and brand", () => {
    expect(billHtmlTitle(doc())).toBe("Quotation CF-Q-1 · Cubig Furniture");
    expect(billHtmlTitle(doc({ kind: "bill", orderNumber: "CB-1061" })).startsWith("Bill CB-1061")).toBe(true);
  });

  it("prints the details block, the lines, and the address in the footer", () => {
    const html = renderBillHtml(doc());
    expect(html).toContain("QUOTATION");
    expect(html).toContain("CF-Q-1");
    expect(html).toContain("Cubig Furniture");
    expect(html).toContain("Modular office desks");
    expect(html).toContain("Quotation details");
    expect(html).toContain(detailRow("Quotation number", "CF-Q-1"));
    expect(html).toContain(detailRow("Customer", "Asha Sheth"));
    expect(html).toContain(detailRow("Mobile number", "9876500011"));
    expect(html).toContain(detailRow("Valid until", "26 Nov 2026"));
    expect(html).toContain(detailRow("Status", "Awaiting acceptance"));
    expect(html).toContain("Proforma estimate");
    expect(html).toContain("Quotation valid for 15 days unless stated otherwise.");
    expect(html).toContain("For Cubig Furniture");
    // No boxed cards any more: one flat list between two hairlines.
    expect(html).not.toMatch(/class="meta"/);
    // The address and contact print in the footer, after the money.
    const footer = html.slice(html.indexOf('<footer class="sheet-footer">'));
    expect(footer).toContain("<address>");
    expect(footer).toContain("info@cubigfurniture.com");
    expect(footer).toContain("Udhna Magdalla Road, Surat");
    expect(footer).toContain("cubigfurniture.com");
    expect(footer).toContain("Quotation valid for 15 days unless stated otherwise.");
    expect(footer).toContain("For Cubig Furniture");
    expect(footer).toContain("Computer-generated quotation from Cubig Furniture.");
    expect(html.indexOf("<address>")).toBeGreaterThan(
      html.indexOf("Cubic Workstation 1800"),
    );
  });

  it("switches the whole document to bill language", () => {
    const html = renderBillHtml(
      doc({
        kind: "bill",
        orderNumber: "CB-1061",
        paymentMethod: "UPI",
        amountPaid: 30000,
        referenceNumber: "CF-Q-1",
        serviceDate: "2026-12-05T09:00:00.000Z",
        customerAddress: "Bandra Kurla Complex, Tower 3",
      }),
    );
    expect(html).toContain("TAX INVOICE");
    expect(html).toContain("Bill details");
    expect(html).toContain(detailRow("Invoice number", "CB-1061"));
    expect(html).toContain(detailRow("Payment", "UPI"));
    expect(html).toContain(detailRow("Against quotation", "CF-Q-1"));
    expect(html).toContain(detailRow("Delivery / installation", "05 Dec 2026"));
    expect(html).toContain(
      detailRow("Delivery address", "Bandra Kurla Complex, Tower 3"),
    );
    expect(html).toContain("Amount received (UPI)");
    expect(html).toContain("Balance due");
    expect(html).toContain("GST tax invoice. Payment as per agreed terms.");
    expect(html).not.toContain("Awaiting acceptance");
  });

  it("says pending when a bill has no payment method", () => {
    expect(
      renderBillHtml(doc({ kind: "bill", paymentMethod: null })),
    ).toContain(detailRow("Payment", "pending"));
  });

  it("falls back to a walk-in customer and the brand name without an issuer", () => {
    const html = renderBillHtml(
      doc({ customerName: "   ", issuer: null, brandCode: undefined, brandName: "Brewery Cafe" }),
    );
    expect(html).toContain("Walk-in customer");
    expect(html).toContain("Brewery Cafe");
    expect(html).toContain("Authorised signatory");
    expect(html).toContain("Prices are exclusive of taxes unless stated above.");
    expect(html).not.toContain("cubigfurniture.com");
  });

  it("writes one row per line with its sku, description, qty, rate and amount", () => {
    const html = renderBillHtml(doc({ kind: "bill" }));
    expect(html).toContain("Cubic Workstation 1800");
    expect(html).toContain("CB-WS-1800 — Three panels, cable tray, felt screen");
    expect(html).toContain(">2 unit</td>");
    expect(html).toContain("₹24,500.00");
    expect(html).toContain("₹47,000.00");
    expect(html).toContain("Swivel Chair");
    expect(html).toContain("₹18,000.00");
    // one header row plus one row per line
    expect(html.match(/<tr>/g)?.length).toBe(3);
  });

  it("shows a minus on discounts and a dash when a line has none", () => {
    const html = renderBillHtml(doc({ kind: "bill" }));
    expect(html).toContain("−₹2,000.00");
    expect(html).toContain('<td class="num">—</td>');
    expect(html).toContain('<td class="num disc">−₹2,000.00</td>');
  });

  it("splits GST into the two halves the PDF prints", () => {
    const html = renderBillHtml(doc());
    expect(html).toContain("CGST (9%)");
    expect(html).toContain("SGST (9%)");
    expect(html).toContain("₹5,670.00");
  });

  it("keeps a plain tax line when the brand charges none", () => {
    const html = renderBillHtml(doc({ taxRatePercent: 0, taxTotal: 0 }));
    expect(html).toContain(">Tax<");
    expect(html).not.toContain("CGST");
  });

  it("shows the advance due on a quotation with a deposit", () => {
    const html = renderBillHtml(doc({ grandTotal: 74340, depositPercent: 40 }));
    expect(html).toContain("Advance payable (40%)");
    expect(html).toContain("₹29,736.00");
  });

  it("omits the advance line when nothing is asked up front", () => {
    expect(renderBillHtml(doc({ depositPercent: null }))).not.toContain(
      "Advance payable",
    );
  });

  it("gives every document a photo column, but only with real images", () => {
    const withPhotos = renderBillHtml(doc(), {
      lineImageDataUrls: ["data:image/jpeg;base64,AAA=", null],
    });
    expect(withPhotos).toContain("<th>Photo</th>");
    expect(withPhotos).toContain('src="data:image/jpeg;base64,AAA="');
    expect(withPhotos.match(/<img alt="" src="data:/g)?.length).toBe(1);

    // A bill is a document too: the counter sells what the menu pictures.
    const bill = renderBillHtml(doc({ kind: "bill" }), {
      lineImageDataUrls: ["data:image/jpeg;base64,AAA=", null],
    });
    expect(bill).toContain("<th>Photo</th>");
    expect(bill).toContain('src="data:image/jpeg;base64,AAA="');
    expect(bill.match(/<td class="photo">/g)?.length).toBe(2);
    expect(bill.match(/<img alt="" src="data:/g)?.length).toBe(1);

    const blankImages = renderBillHtml(doc({ kind: "bill" }), {
      lineImageDataUrls: ["   ", null],
    });
    expect(blankImages).not.toContain("<th>Photo</th>");

    const noImages = renderBillHtml(doc(), { lineImageDataUrls: [null, null] });
    expect(noImages).not.toContain("<th>Photo</th>");
    expect(renderBillHtml(doc())).not.toContain("<th>Photo</th>");
  });

  it("prints the brand mark on a bill letterhead as well as a quotation", () => {
    const bill = renderBillHtml(doc({ kind: "bill", orderNumber: "BC-1061" }), {
      logoDataUrl: "data:image/png;base64,LOGO",
      lineImageDataUrls: ["data:image/jpeg;base64,AAA=", null],
    });
    expect(bill).toContain('src="data:image/png;base64,LOGO"');
    expect(bill).toContain("<th>Photo</th>");
    expect(bill).toContain("TAX INVOICE");
  });

  it("inlines the brand mark when one is supplied", () => {
    const html = renderBillHtml(doc(), { logoDataUrl: "data:image/png;base64,LOGO" });
    expect(html).toContain('src="data:image/png;base64,LOGO"');
    expect(renderBillHtml(doc())).not.toContain("data:image/png;base64,LOGO");
  });

  it("prints notes and the receipt footer as their own blocks", () => {
    const html = renderBillHtml(
      doc({ notes: "Install on a Sunday, lift pass with the society office", receiptFooter: "Thank you for the order." }),
    );
    expect(html).toContain("<h2>Notes</h2>");
    expect(html).toContain("lift pass with the society office");
    expect(html).toContain("Thank you for the order.");
  });

  it("escapes merchant and customer text instead of trusting it", () => {
    const html = renderBillHtml(
      doc({
        customerName: '<script>alert("x")</script>',
        customerPhone: "<b>999</b>",
        customerAddress: '1st Floor "B" Wing',
        notes: "</td></tr><script>steal()</script>",
        receiptFooter: "<img src=x onerror=alert(1)>",
        referenceNumber: '<svg onload="boom()">',
        lines: [
          {
            name: 'Chairs &amp; tables <2>',
            quantity: 1,
            unit: 'piece"',
            listUnitPrice: 100,
            lineDiscount: 0,
            lineTotal: 100,
            sku: "<i>SKU</i>",
            description: null,
          },
        ],
      }),
    );
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<script>steal");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<svg onload");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("Chairs &amp;amp; tables &lt;2&gt;");
    expect(html).toContain("&lt;i&gt;SKU&lt;/i&gt;");
    // The document must still parse as one tree: exactly one <html> element.
    expect(html.match(/<html/g)?.length).toBe(1);
  });

  it("keeps non-rupee currencies readable and named", () => {
    const html = renderBillHtml(
      doc({ currencyCode: "USD", listSubtotal: 1200, taxableSubtotal: 1200, taxTotal: 0, taxRatePercent: 0, grandTotal: 1200, lines: [] }),
    );
    expect(html).toContain(detailRow("Currency", "USD"));
    expect(html).toContain("1,200.00");
  });

  it("names the file after the document kind, like the PDF does", () => {
    expect(billDocumentFilename(doc())).toBe("Quotation-CF-Q-1.pdf");
    expect(billDocumentFilename(doc(), "html")).toBe("Quotation-CF-Q-1.html");
    expect(billDocumentFilename(doc({ kind: "bill", orderNumber: "CB/10 61" }), "html")).toBe(
      "Bill-CB-10-61.html",
    );
  });
});

describe("openBillHtml", () => {
  type Tab = {
    closed: boolean;
    opener: unknown;
    location: { href: string };
    close: () => void;
  };

  function makeTab(closedCount: number[]): Tab {
    return {
      closed: false,
      opener: undefined,
      location: { href: "" },
      close: () => closedCount.push(closedCount.length + 1),
    };
  }

  function stubBrowser(stub: { opened?: unknown } = {}) {
    const closed: number[] = [];
    const tab = makeTab(closed);
    const state = {
      tab,
      closed,
      openCalls: 0,
      created: [] as string[],
      revoked: [] as string[],
      downloaded: [] as string[],
      opened: "opened" in stub ? stub.opened : tab,
    };
    // A fresh namespace per stub, so one test's leftover URL can never look
    // like another test's revoke.
    let seed = 0;
    const ns = `ns${Math.random().toString(36).slice(2)}`;
    vi.stubGlobal("URL", {
      createObjectURL: () => {
        const url = `blob:https://orderbook.test/${ns}/${seed++}`;
        state.created.push(url);
        return url;
      },
      revokeObjectURL: (url: string) => state.revoked.push(url),
    });
    vi.stubGlobal("Blob", class {
      constructor(public parts: string[]) {}
    });
    vi.stubGlobal("window", {
      open: () => {
        state.openCalls++;
        return state.opened;
      },
    });
    const anchor = {
      href: "",
      download: "",
      rel: "",
      click: () => state.downloaded.push(anchor.download),
      remove: () => {},
    };
    vi.stubGlobal("document", {
      createElement: () => anchor,
      body: { appendChild: () => {} },
    });
    return state;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens a new tab with the rendered file", async () => {
    const state = stubBrowser();
    const result = await openBillHtml(doc());
    expect(result).toEqual({ ok: true, where: "tab" });
    expect(state.created).toHaveLength(1);
    expect(state.tab.location.href).toBe(state.created[0]);
    // The document is a file the merchant keeps, not a window that can reach back.
    expect(state.tab.opener).toBeNull();
    expect(state.downloaded).toEqual([]);
  });

  it("claims the tab while the click is still a gesture, before photos land", async () => {
    const state = stubBrowser();
    // Quotation photos are fetched and inlined; that must not delay window.open,
    // otherwise the browser treats it as a pop-up and only a download happens.
    vi.stubGlobal("fetch", () => new Promise(() => {}));
    const pending = openBillHtml(doc());
    await Promise.resolve();
    await Promise.resolve();
    expect(state.openCalls).toBe(1);
    expect(state.tab.location.href).toBe("");
    expect(pending).toBeInstanceOf(Promise);
  });

  it("saves the file when the pop-up is blocked", async () => {
    const state = stubBrowser({ opened: null });
    const result = await openBillHtml(doc());
    expect(result).toEqual({ ok: true, where: "download" });
    expect(state.downloaded).toEqual(["Quotation-CF-Q-1.html"]);
  });

  it("releases the previous file when a new one is opened", async () => {
    const state = stubBrowser();
    await openBillHtml(doc());
    await openBillHtml(doc({ orderNumber: "CF-Q-2" }));
    expect(state.created).toHaveLength(2);
    expect(state.revoked).toContain(state.created[0]);
    expect(state.revoked).not.toContain(state.created[1]);
  });

  it("reports a failure instead of throwing at the button", async () => {
    const state = stubBrowser();
    vi.stubGlobal("URL", {
      createObjectURL: () => {
        throw new Error("No blob URLs here");
      },
    });
    await expect(openBillHtml(doc())).resolves.toEqual({
      ok: false,
      error: "No blob URLs here",
    });
    // The blank tab the click opened must not be left behind.
    expect(state.closed).toHaveLength(1);
  });
});
