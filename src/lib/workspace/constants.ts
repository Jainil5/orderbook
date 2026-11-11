export const DEMO_WORKSPACE_COOKIE = "ob_demo_workspace";

export const DEMO_BRAND_CODES = ["BR-1", "BR-2"] as const;
export type DemoBrandCode = (typeof DEMO_BRAND_CODES)[number];

export const DEFAULT_DEMO_BRAND_CODE: DemoBrandCode = "BR-1";

export function parseDemoBrandCodeFromCookie(
  value: string | undefined,
): DemoBrandCode | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "1") return "BR-1";
  if ((DEMO_BRAND_CODES as readonly string[]).includes(normalized)) {
    return normalized as DemoBrandCode;
  }
  return null;
}

export function isDemoWorkspaceCookieValue(value: string | undefined): boolean {
  return parseDemoBrandCodeFromCookie(value) !== null;
}

export const WORKSPACE_ROUTE_PREFIXES = [
  "/dashboard",
  "/billing",
  "/quotation",
  "/orders",
  "/products",
  "/offers",
  "/catalog",
  "/manager",
  "/analytics",
  "/customers",
  "/settings",
  "/payments",
] as const;

export function isWorkspacePath(pathname: string): boolean {
  return WORKSPACE_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function demoPathToAppPath(pathname: string): string {
  if (pathname === "/demo" || pathname === "/demo/") return "/dashboard";
  if (pathname.startsWith("/demo/")) {
    const rest = pathname.slice("/demo".length);
    return rest.length ? rest : "/dashboard";
  }
  return "/dashboard";
}

export type BillingPosCopy = {
  cartTitle: string;
  /** When brand uses split quote/bill makers (e.g. furniture). */
  quotationCartTitle?: string;
  billCartTitle?: string;
  quotationModeHint?: string;
  billModeHint?: string;
  /** Project capture fields — counter brands leave these unset. */
  projectFields?: {
    dateLabel: string;
    siteLabel: string;
    sitePlaceholder: string;
    leadLabel: string;
    chargesLabel: string;
    chargesPlaceholder: string;
    depositLabel: string;
  };
  emptyCartHint: string;
  addButton: string;
  addAnotherButton: string;
  searchPlaceholder: string;
  confirmButton: string;
  confirmQuoteButton: string;
  saveAsQuoteLabel: string;
  /** Include `{orderNumber}` placeholder */
  savedBillMessage: string;
  /** Include `{orderNumber}` placeholder */
  savedQuoteMessage: string;
};

/** Which capture fields a brand's order forms show. */
export type CaptureMode = "counter" | "project";

/** Which workspace screen drives checkout: single Billing, or split Quotation / Bill tabs. */
export type BillingDocumentMode = "retail" | "quotation" | "bill";

export function formatBillingSavedMessage(
  template: string,
  orderNumber: string,
): string {
  return template.replaceAll("{orderNumber}", orderNumber);
}

export type WorkspaceProfile = {
  /** `project` = enquiry → quotation → bill capture fields; `counter` = walk-in hospitality. */
  capture: CaptureMode;
  billingPageTitle: string;
  ordersPageTitle: string;
  ordersNumberColumn: string;
  billingPos: BillingPosCopy;
  navLabelOverrides: Partial<
    Record<
      | "Dashboard"
      | "Billing"
      | "Quotation"
      | "Bill"
      | "Orders"
      | "Analytics"
      | "Customers"
      | "Payments"
      | "Settings",
      string
    >
  >;
};

export const RETAIL_BILLING_COPY: BillingPosCopy = {
  cartTitle: "Current bill",
  emptyCartHint:
    "Tap Add to bill on menu items to build the order.",
  addButton: "Add to bill",
  addAnotherButton: "Add another",
  searchPlaceholder: "Search menu…",
  confirmButton: "Confirm & save order",
  confirmQuoteButton: "Save quotation",
  saveAsQuoteLabel: "Save as quotation (no payment yet)",
  savedBillMessage: "Order {orderNumber} saved to Orders. WhatsApp and PDF are optional below.",
  savedQuoteMessage: "Quotation {orderNumber} saved to Orders. WhatsApp and PDF are optional below.",
};

const FURNITURE_BILLING_COPY: BillingPosCopy = {
  cartTitle: "Quote / bill",
  quotationCartTitle: "Quotation builder",
  billCartTitle: "Bill & payment",
  quotationModeHint:
    "Build a proforma quote for the customer. Share PDF or WhatsApp; payment is not collected yet.",
  billModeHint:
    "Issue a paid tax invoice after the customer accepts or pays.",
  projectFields: {
    dateLabel: "Delivery / installation date",
    siteLabel: "Site address",
    sitePlaceholder: "Project address, floor, city…",
    leadLabel: "Lead / enquiry reference",
    chargesLabel: "Delivery & installation charges",
    chargesPlaceholder: "e.g. 4500",
    depositLabel: "Advance / deposit %",
  },
  emptyCartHint:
    "Add furniture lines from the catalog to build a quotation or bill.",
  addButton: "Add to quote",
  addAnotherButton: "Add another",
  searchPlaceholder: "Search catalog…",
  confirmButton: "Confirm bill & payment",
  confirmQuoteButton: "Save quotation",
  saveAsQuoteLabel: "Save as quotation (payment pending)",
  savedBillMessage: "Bill {orderNumber} saved to Orders. WhatsApp and PDF are optional below.",
  savedQuoteMessage: "Quotation {orderNumber} saved to Orders. WhatsApp and PDF are optional below.",
};

const DEFAULT_PROFILE: WorkspaceProfile = {
  capture: "counter",
  billingPageTitle: "Billing",
  ordersPageTitle: "Orders",
  ordersNumberColumn: "Bill #",
  billingPos: RETAIL_BILLING_COPY,
  navLabelOverrides: {},
};

const CUBIG_PROFILE: WorkspaceProfile = {
  capture: "project",
  billingPageTitle: "Bill",
  ordersPageTitle: "Quotes & bills",
  ordersNumberColumn: "Quote / bill #",
  billingPos: FURNITURE_BILLING_COPY,
  navLabelOverrides: {
    Orders: "Quotes & bills",
  },
};

export function getWorkspaceProfile(brandCode: string): WorkspaceProfile {
  if (brandCode.trim().toUpperCase() === "BR-2") return CUBIG_PROFILE;
  return DEFAULT_PROFILE;
}
