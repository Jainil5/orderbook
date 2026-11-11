import {
  Armchair,
  BarChart3,
  ClipboardList,
  Coffee,
  FileText,
  Receipt,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DemoBrandCode } from "@/lib/workspace/constants";

export type Feature = {
  icon: LucideIcon;
  title: string;
  body: string;
};

/**
 * The capability list shown on both entry surfaces: the marketing page at `/`
 * and the demo entry page at `/login`. Single source so the two never drift.
 */
export const FEATURES: Feature[] = [
  {
    icon: Receipt,
    title: "Billing & POS",
    body: "Ring up counter sales in seconds — tender split, discounts and GST-ready bills included.",
  },
  {
    icon: ClipboardList,
    title: "Order lifecycle",
    body: "Track every bill from kitchen and floor to completion, with unavailable-item handling built in.",
  },
  {
    icon: FileText,
    title: "Quotes & invoices",
    body: "Send quotations for big-ticket work and turn an accepted quote into a confirmed bill without retyping.",
  },
  {
    icon: Wallet,
    title: "Payments & collections",
    body: "Partial payments, open balances and collection rates — know exactly what is still due.",
  },
  {
    icon: BarChart3,
    title: "Analytics studio",
    body: "Revenue trends, category mix, tender split and margin & COGS across any date range.",
  },
  {
    icon: Users,
    title: "Staff & operations",
    body: "Shifts, tasks, appointments, field visits and service jobs in one management desk.",
  },
];

export type BrandCardCopy = {
  name: string;
  icon: LucideIcon;
  tagline: string;
  /** Screens a visitor can actually reach inside that demo workspace. */
  highlights: string[];
};

export const BRAND_CARD_COPY: Record<DemoBrandCode, BrandCardCopy> = {
  "BR-1": {
    name: "Brewery Cafe",
    icon: Coffee,
    tagline: "Fast counter service, kitchen tickets and a six-month sales story.",
    highlights: [
      "Ring up counter bills with cash, UPI or card tenders",
      "Push tickets to the kitchen board and follow fulfilment",
      "Mark items unavailable mid-rush without breaking bills",
      "Read revenue, category mix, tender split and margin",
    ],
  },
  "BR-2": {
    name: "Cubig Furniture",
    icon: Armchair,
    tagline: "Quotation-led sales with jobs, visits and part payments.",
    highlights: [
      "Build a quotation with product images and 18% GST",
      "Share a public accept link and track the response",
      "Schedule installations, service jobs and field visits",
      "Follow deposits, part payments and open balances",
    ],
  },
};

/** Steps that explain how the demo workspace behaves. */
export const DEMO_STEPS: { title: string; body: string }[] = [
  {
    title: "Pick a business",
    body: "One click opens a full workspace — no sign-up, no email, no plan.",
  },
  {
    title: "Work the counter",
    body: "Create bills, capture payments, move orders, edit stock like a real shift.",
  },
  {
    title: "Edits stay on your device",
    body: "Changes are stored in your browser and reset whenever you clear it.",
  },
];
