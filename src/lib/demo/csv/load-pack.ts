import type { DemoBrandPack } from "@/lib/demo/brands/types";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import { parseCsvObjects } from "./parse-csv";
import { rebasePackDates } from "./rebase";
import {
  mapBrand,
  mapBrandSettings,
  mapInventoryItem,
  mapProduct,
  mapProductIngredient,
  mapCustomer,
  mapOrder,
  mapOrderItem,
  mapPayment,
  mapOffer,
  mapStaff,
  mapService,
  mapServiceJob,
  mapAppointment,
  mapFieldVisit,
  mapShift,
  mapTask,
  mapLead,
  mapPurchaseOrder,
  mapPurchaseOrderLine,
  mapVendor,
} from "./mappers";
import {
  mapCampaign,
  mapComplaint,
  mapInteraction,
  mapLoyaltyEntry,
  mapLoyaltyRules,
  mapMembership,
  mapReview,
  mapSegment,
} from "./crm-mappers";

import b1Brand from "../../../../data/demo/BR-1/brand.csv";
import b1Settings from "../../../../data/demo/BR-1/brand_settings.csv";
import b1Products from "../../../../data/demo/BR-1/products.csv";
import b1Inventory from "../../../../data/demo/BR-1/inventory.csv";
import b1Recipes from "../../../../data/demo/BR-1/recipes.csv";
import b1Customers from "../../../../data/demo/BR-1/customers.csv";
import b1Orders from "../../../../data/demo/BR-1/orders.csv";
import b1Items from "../../../../data/demo/BR-1/order_items.csv";
import b1Payments from "../../../../data/demo/BR-1/payments.csv";
import b1Offers from "../../../../data/demo/BR-1/offers.csv";
import b1Staff from "../../../../data/demo/BR-1/staff.csv";
import b1Services from "../../../../data/demo/BR-1/services.csv";
import b1Jobs from "../../../../data/demo/BR-1/service_jobs.csv";
import b1Appointments from "../../../../data/demo/BR-1/appointments.csv";
import b1Visits from "../../../../data/demo/BR-1/field_visits.csv";
import b1Shifts from "../../../../data/demo/BR-1/shifts.csv";
import b1Tasks from "../../../../data/demo/BR-1/tasks.csv";
import b1Leads from "../../../../data/demo/BR-1/leads.csv";
import b1Interactions from "../../../../data/demo/BR-1/interactions.csv";
import b1Reviews from "../../../../data/demo/BR-1/reviews.csv";
import b1Complaints from "../../../../data/demo/BR-1/complaints.csv";
import b1Segments from "../../../../data/demo/BR-1/segments.csv";
import b1Campaigns from "../../../../data/demo/BR-1/campaigns.csv";
import b1LoyaltyRules from "../../../../data/demo/BR-1/loyalty_rules.csv";
import b1LoyaltyLedger from "../../../../data/demo/BR-1/loyalty_ledger.csv";
import b1Memberships from "../../../../data/demo/BR-1/memberships.csv";
import b1Vendors from "../../../../data/demo/BR-1/vendors.csv";
import b1PurchaseOrders from "../../../../data/demo/BR-1/purchase_orders.csv";
import b1PurchaseOrderLines from "../../../../data/demo/BR-1/purchase_order_lines.csv";

import b2Brand from "../../../../data/demo/BR-2/brand.csv";
import b2Settings from "../../../../data/demo/BR-2/brand_settings.csv";
import b2Products from "../../../../data/demo/BR-2/products.csv";
import b2Inventory from "../../../../data/demo/BR-2/inventory.csv";
import b2Customers from "../../../../data/demo/BR-2/customers.csv";
import b2Orders from "../../../../data/demo/BR-2/orders.csv";
import b2Items from "../../../../data/demo/BR-2/order_items.csv";
import b2Payments from "../../../../data/demo/BR-2/payments.csv";
import b2Offers from "../../../../data/demo/BR-2/offers.csv";
import b2Staff from "../../../../data/demo/BR-2/staff.csv";
import b2Services from "../../../../data/demo/BR-2/services.csv";
import b2Jobs from "../../../../data/demo/BR-2/service_jobs.csv";
import b2Appointments from "../../../../data/demo/BR-2/appointments.csv";
import b2Visits from "../../../../data/demo/BR-2/field_visits.csv";
import b2Shifts from "../../../../data/demo/BR-2/shifts.csv";
import b2Tasks from "../../../../data/demo/BR-2/tasks.csv";
import b2Leads from "../../../../data/demo/BR-2/leads.csv";
import b2Interactions from "../../../../data/demo/BR-2/interactions.csv";
import b2Reviews from "../../../../data/demo/BR-2/reviews.csv";
import b2Complaints from "../../../../data/demo/BR-2/complaints.csv";
import b2Segments from "../../../../data/demo/BR-2/segments.csv";
import b2Campaigns from "../../../../data/demo/BR-2/campaigns.csv";
import b2LoyaltyRules from "../../../../data/demo/BR-2/loyalty_rules.csv";
import b2LoyaltyLedger from "../../../../data/demo/BR-2/loyalty_ledger.csv";
import b2Memberships from "../../../../data/demo/BR-2/memberships.csv";
import b2Vendors from "../../../../data/demo/BR-2/vendors.csv";
import b2PurchaseOrders from "../../../../data/demo/BR-2/purchase_orders.csv";
import b2PurchaseOrderLines from "../../../../data/demo/BR-2/purchase_order_lines.csv";

type BrandCsvFiles = {
  brand: string;
  settings: string;
  products: string;
  inventory: string;
  /** Empty string means the pack ships no recipes at all. */
  recipes: string;
  customers: string;
  orders: string;
  items: string;
  payments: string;
  offers: string;
  staff: string;
  services: string;
  jobs: string;
  appointments: string;
  visits: string;
  shifts: string;
  tasks: string;
  leads: string;
  interactions: string;
  reviews: string;
  complaints: string;
  segments: string;
  campaigns: string;
  loyaltyRules: string;
  loyaltyLedger: string;
  memberships: string;
  vendors: string;
  purchaseOrders: string;
  purchaseOrderLines: string;
};

const FILES: Record<DemoBrandCode, BrandCsvFiles> = {
  "BR-1": {
    brand: b1Brand, settings: b1Settings, products: b1Products, customers: b1Customers,
    inventory: b1Inventory, recipes: b1Recipes,
    orders: b1Orders, items: b1Items, payments: b1Payments, offers: b1Offers,
    staff: b1Staff, services: b1Services, jobs: b1Jobs, appointments: b1Appointments,
    visits: b1Visits, shifts: b1Shifts, tasks: b1Tasks, leads: b1Leads,
    interactions: b1Interactions, reviews: b1Reviews, complaints: b1Complaints,
    segments: b1Segments, campaigns: b1Campaigns, loyaltyRules: b1LoyaltyRules,
    loyaltyLedger: b1LoyaltyLedger, memberships: b1Memberships,
    vendors: b1Vendors, purchaseOrders: b1PurchaseOrders,
    purchaseOrderLines: b1PurchaseOrderLines,
  },
  "BR-2": {
    brand: b2Brand, settings: b2Settings, products: b2Products, customers: b2Customers,
    inventory: b2Inventory, recipes: "",
    orders: b2Orders, items: b2Items, payments: b2Payments, offers: b2Offers,
    staff: b2Staff, services: b2Services, jobs: b2Jobs, appointments: b2Appointments,
    visits: b2Visits, shifts: b2Shifts, tasks: b2Tasks, leads: b2Leads,
    interactions: b2Interactions, reviews: b2Reviews, complaints: b2Complaints,
    segments: b2Segments, campaigns: b2Campaigns, loyaltyRules: b2LoyaltyRules,
    loyaltyLedger: b2LoyaltyLedger, memberships: b2Memberships,
    vendors: b2Vendors, purchaseOrders: b2PurchaseOrders,
    purchaseOrderLines: b2PurchaseOrderLines,
  },
};

const cache = new Map<DemoBrandCode, DemoBrandPack>();

export function loadDemoBrandPack(code: DemoBrandCode): DemoBrandPack {
  const hit = cache.get(code);
  if (hit) return hit;
  const f = FILES[code];
  const rows = (text: string, name: string) => parseCsvObjects(text, `${code}/${name}`);
  const src = (name: string) => `${code}/${name}`;
  const { brand, orderNumberPrefix } = mapBrand(rows(f.brand, "brand.csv")[0], src("brand.csv"));
  const pack: DemoBrandPack = {
    brand,
    orderNumberPrefix,
    settings: mapBrandSettings(rows(f.settings, "brand_settings.csv")[0], src("brand_settings.csv")),
    products: rows(f.products, "products.csv").map((r) => mapProduct(r, src("products.csv"))),
    inventory: rows(f.inventory, "inventory.csv").map((r) =>
      mapInventoryItem(r, src("inventory.csv")),
    ),
    // A brand that issues materials per job ships no recipe file; the empty
    // pack list is what makes its usage report read as "nothing derived".
    ingredients: f.recipes
      ? rows(f.recipes, "recipes.csv").map((r) => mapProductIngredient(r, src("recipes.csv")))
      : [],
    customers: rows(f.customers, "customers.csv").map((r) => mapCustomer(r, src("customers.csv"))),
    orders: rows(f.orders, "orders.csv").map((r) => mapOrder(r, src("orders.csv"))),
    orderItems: rows(f.items, "order_items.csv").map((r) => mapOrderItem(r, src("order_items.csv"))),
    payments: rows(f.payments, "payments.csv").map((r) => mapPayment(r, src("payments.csv"))),
    offers: rows(f.offers, "offers.csv").map((r) => mapOffer(r, src("offers.csv"))),
    staff: rows(f.staff, "staff.csv").map((r) => mapStaff(r, src("staff.csv"))),
    services: rows(f.services, "services.csv").map((r) => mapService(r, src("services.csv"))),
    serviceJobs: rows(f.jobs, "service_jobs.csv").map((r) => mapServiceJob(r, src("service_jobs.csv"))),
    appointments: rows(f.appointments, "appointments.csv").map((r) => mapAppointment(r, src("appointments.csv"))),
    visits: rows(f.visits, "field_visits.csv").map((r) => mapFieldVisit(r, src("field_visits.csv"))),
    shifts: rows(f.shifts, "shifts.csv").map((r) => mapShift(r, src("shifts.csv"))),
    tasks: rows(f.tasks, "tasks.csv").map((r) => mapTask(r, src("tasks.csv"))),
    leads: rows(f.leads, "leads.csv").map((r) => mapLead(r, src("leads.csv"))),
    interactions: rows(f.interactions, "interactions.csv").map((r) =>
      mapInteraction(r, src("interactions.csv")),
    ),
    reviews: rows(f.reviews, "reviews.csv").map((r) => mapReview(r, src("reviews.csv"))),
    complaints: rows(f.complaints, "complaints.csv").map((r) =>
      mapComplaint(r, src("complaints.csv")),
    ),
    segments: rows(f.segments, "segments.csv").map((r) => mapSegment(r, src("segments.csv"))),
    campaigns: rows(f.campaigns, "campaigns.csv").map((r) =>
      mapCampaign(r, src("campaigns.csv")),
    ),
    loyaltyRules: rows(f.loyaltyRules, "loyalty_rules.csv").map((r) =>
      mapLoyaltyRules(r, src("loyalty_rules.csv")),
    ),
    loyaltyLedger: rows(f.loyaltyLedger, "loyalty_ledger.csv").map((r) =>
      mapLoyaltyEntry(r, src("loyalty_ledger.csv")),
    ),
    memberships: rows(f.memberships, "memberships.csv").map((r) =>
      mapMembership(r, src("memberships.csv")),
    ),
    vendors: rows(f.vendors, "vendors.csv").map((r) =>
      mapVendor(r, src("vendors.csv")),
    ),
    purchaseOrders: rows(f.purchaseOrders, "purchase_orders.csv").map((r) =>
      mapPurchaseOrder(r, src("purchase_orders.csv")),
    ),
    purchaseOrderLines: rows(f.purchaseOrderLines, "purchase_order_lines.csv").map(
      (r) => mapPurchaseOrderLine(r, src("purchase_order_lines.csv")),
    ),
  };
  const rebased = rebasePackDates(pack);
  cache.set(code, rebased);
  return rebased;
}