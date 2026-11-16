import { isoDay, isoInstant } from "@/lib/demo/business/dates";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import type { PurchaseOrder, Supplier } from "@/types/business";

/**
 * Seeded suppliers and purchase orders per demo brand (Products Manager →
 * Procurement). Owned by the Products Manager feature area — replace these
 * starter rows with a full purchasing history rather than adding another data
 * source.
 *
 * Line costs mirror each product's `cost_price` in the brand fixtures, and the
 * three orders per brand cover the open end of the flow (placed, part
 * received, fully received) so the status rules have something to show.
 */

type Pack = { suppliers: Supplier[]; purchaseOrders: PurchaseOrder[] };

const CAFE_SUPPLIERS: Supplier[] = [
  {
    id: "sup-bc-roast",
    brand_id: "demo-brewery-cafe",
    name: "Highland Roasters",
    contactName: "Aditi Rao",
    phone: "+91 98200 11223",
    email: "orders@highlandroasters.demo",
    category: "Coffee",
    leadTimeDays: 7,
    paymentTerms: "Net 15",
    notes: "Single-origin lots; roast dates every Tuesday.",
    is_active: true,
    created_at: isoInstant(-120),
  },
  {
    id: "sup-bc-dairy",
    brand_id: "demo-brewery-cafe",
    name: "Valley Dairy Co-op",
    contactName: "Shamim Khan",
    phone: "+91 98111 44556",
    email: null,
    category: "Dairy",
    leadTimeDays: 2,
    paymentTerms: "Weekly",
    notes: "Milk, cream and yogurt delivered before 7am.",
    is_active: true,
    created_at: isoInstant(-90),
  },
  {
    id: "sup-bc-produce",
    brand_id: "demo-brewery-cafe",
    name: "Green Cart Produce",
    contactName: "Meenal D'Souza",
    phone: "+91 99870 77889",
    email: "buy@greencart.demo",
    category: "Produce",
    leadTimeDays: 3,
    paymentTerms: "Net 7",
    notes: "Avocado and seasonal fruit; substitute if a lot is short.",
    is_active: true,
    created_at: isoInstant(-60),
  },
  {
    id: "sup-bc-pack",
    brand_id: "demo-brewery-cafe",
    name: "Kora Packaging",
    contactName: null,
    phone: "+91 90040 22110",
    email: null,
    category: "Packaging",
    leadTimeDays: 14,
    paymentTerms: "Prepaid",
    notes: "Cups, lids and pastry boxes.",
    is_active: false,
    created_at: isoInstant(-200),
  },
];

const CAFE_ORDERS: PurchaseOrder[] = [
  {
    id: "po-bc-1",
    brand_id: "demo-brewery-cafe",
    poNumber: "PO-1041",
    supplierId: "sup-bc-roast",
    status: "ordered",
    expectedOn: isoDay(4),
    createdAt: isoInstant(-3),
    lines: [
      { productId: "p1", name: "Flat White", qty: 120, unitCost: 55, receivedQty: 0 },
      { productId: "p7", name: "Espresso", qty: 90, unitCost: 35, receivedQty: 0 },
    ],
    notes: "House blend for the month.",
  },
  {
    id: "po-bc-2",
    brand_id: "demo-brewery-cafe",
    poNumber: "PO-1042",
    supplierId: "sup-bc-dairy",
    status: "partially_received",
    expectedOn: isoDay(1),
    createdAt: isoInstant(-2),
    lines: [
      { productId: "p8", name: "Cappuccino", qty: 80, unitCost: 55, receivedQty: 50 },
      { productId: "p13", name: "Hot Chocolate", qty: 40, unitCost: 55, receivedQty: 0 },
    ],
    notes: "Cream portion short this week.",
  },
  {
    id: "po-bc-3",
    brand_id: "demo-brewery-cafe",
    poNumber: "PO-1038",
    supplierId: "sup-bc-produce",
    status: "received",
    expectedOn: isoDay(-5),
    createdAt: isoInstant(-8),
    lines: [
      { productId: "p3", name: "Avocado Toast", qty: 60, unitCost: 95, receivedQty: 60 },
      { productId: "p14", name: "Mango Smoothie", qty: 45, unitCost: 80, receivedQty: 45 },
    ],
    notes: "",
  },
];

const FURNITURE_SUPPLIERS: Supplier[] = [
  {
    id: "sup-cf-ply",
    brand_id: "demo-cubig-furniture",
    name: "Sahyadri Ply & Timber",
    contactName: "Rakesh Menon",
    phone: "+91 93250 88123",
    email: "sales@sahyadriforest.demo",
    category: "Timber & ply",
    leadTimeDays: 10,
    paymentTerms: "Net 30",
    notes: "Banded ply boards and solid oak blanks.",
    is_active: true,
    created_at: isoInstant(-300),
  },
  {
    id: "sup-cf-hardware",
    brand_id: "demo-cubig-furniture",
    name: "Aurora Fittings",
    contactName: "Nisha Parekh",
    phone: "+91 98980 33221",
    email: null,
    category: "Hardware",
    leadTimeDays: 6,
    paymentTerms: "Net 15",
    notes: "Hinges, soft-close slides, chair bases.",
    is_active: true,
    created_at: isoInstant(-240),
  },
  {
    id: "sup-cf-polish",
    brand_id: "demo-cubig-furniture",
    name: "Kalyan Finishes",
    contactName: null,
    phone: "+91 90990 11778",
    email: "orders@kalyanfinishes.demo",
    category: "Polish & adhesives",
    leadTimeDays: 4,
    paymentTerms: "Prepaid",
    notes: "PU lacquer and hardeners, mixed to sample.",
    is_active: true,
    created_at: isoInstant(-150),
  },
  {
    id: "sup-cf-uphol",
    brand_id: "demo-cubig-furniture",
    name: "Rajluxe Upholstery",
    contactName: "Imran Sheikh",
    phone: null,
    email: null,
    category: "Upholstery",
    leadTimeDays: 12,
    paymentTerms: "Net 30",
    notes: "Performance fabric by the metre; swatches on request.",
    is_active: false,
    created_at: isoInstant(-400),
  },
];

const FURNITURE_ORDERS: PurchaseOrder[] = [
  {
    id: "po-cf-1",
    brand_id: "demo-cubig-furniture",
    poNumber: "PO-2077",
    supplierId: "sup-cf-ply",
    status: "ordered",
    expectedOn: isoDay(7),
    createdAt: isoInstant(-4),
    lines: [
      { productId: "fp1", name: "Oslo Dining Table", qty: 6, unitCost: 22000, receivedQty: 0 },
      { productId: "fp4", name: "Maple Wardrobe 2-Door", qty: 4, unitCost: 28000, receivedQty: 0 },
    ],
    notes: "Stock build for the showroom.",
  },
  {
    id: "po-cf-2",
    brand_id: "demo-cubig-furniture",
    poNumber: "PO-2078",
    supplierId: "sup-cf-hardware",
    status: "partially_received",
    expectedOn: isoDay(0),
    createdAt: isoInstant(-6),
    lines: [
      { productId: "fp2", name: "Mesh Office Chair", qty: 20, unitCost: 6200, receivedQty: 12 },
      { productId: "fp5", name: "Study Desk with Drawer", qty: 10, unitCost: 9100, receivedQty: 0 },
    ],
    notes: "Chair bases split across two consignments.",
  },
  {
    id: "po-cf-3",
    brand_id: "demo-cubig-furniture",
    poNumber: "PO-2071",
    supplierId: "sup-cf-polish",
    status: "received",
    expectedOn: isoDay(-9),
    createdAt: isoInstant(-14),
    lines: [
      { productId: "fp3", name: "Luna 3-Seater Sofa", qty: 3, unitCost: 34000, receivedQty: 3 },
      { productId: "fp8", name: "Custom Modular Shelf", qty: 5, unitCost: 12000, receivedQty: 5 },
    ],
    notes: "",
  },
];

const PACKS: Record<DemoBrandCode, Pack> = {
  "BR-1": { suppliers: CAFE_SUPPLIERS, purchaseOrders: CAFE_ORDERS },
  "BR-2": { suppliers: FURNITURE_SUPPLIERS, purchaseOrders: FURNITURE_ORDERS },
};

export function demoSuppliers(brandCode: DemoBrandCode): Supplier[] {
  return PACKS[brandCode]?.suppliers ?? [];
}

export function demoPurchaseOrders(brandCode: DemoBrandCode): PurchaseOrder[] {
  return PACKS[brandCode]?.purchaseOrders ?? [];
}
