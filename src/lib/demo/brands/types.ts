import type {
  Brand,
  BrandSettings,
  Customer,
  InventoryItem,
  Offer,
  Order,
  OrderItem,
  Payment,
  Product,
  ProductIngredient,
} from "@/types/database";
import type { StaffMember } from "@/types/manager";
import type {
  PurchaseOrder,
  PurchaseOrderLine,
  Vendor,
} from "@/types/procurement";
import type {
  Appointment,
  FieldVisit,
  Lead,
  Service,
  ServiceJob,
  Shift,
  Task,
} from "@/types/operations";
import type {
  CustomerComplaint,
  CustomerInteraction,
  CustomerReview,
  CustomerSegment,
  LoyaltyEntry,
  LoyaltyRules,
  MarketingCampaign,
  Membership,
} from "@/types/crm";

export type DemoBrandPack = {
  brand: Brand;
  settings: BrandSettings;
  products: Product[];
  /** Consumables bought in packs (bread, milk, plywood, fabric). */
  inventory: InventoryItem[];
  /**
   * Recipe / bill-of-materials lines per product. Empty for brands that issue
   * materials per job rather than consuming them per sale — a pack without a
   * recipes file is a deliberate shape, not missing data.
   */
  ingredients: ProductIngredient[];
  customers: Customer[];
  orders: Order[];
  orderItems: OrderItem[];
  offers: Offer[];
  payments: Payment[];
  // --- Purchasing ------------------------------------------------------
  /** Who the brand buys from. */
  vendors: Vendor[];
  /** Orders placed on those vendors, header rows. */
  purchaseOrders: PurchaseOrder[];
  /** Line items of each purchase order, keyed by `po_id`. */
  purchaseOrderLines: PurchaseOrderLine[];
  staff: StaffMember[];
  services: Service[];
  serviceJobs: ServiceJob[];
  appointments: Appointment[];
  visits: FieldVisit[];
  shifts: Shift[];
  tasks: Task[];
  /** Sales pipeline for project businesses; empty for counter-service brands. */
  leads: Lead[];
  /** Prefix for demo order numbers, e.g. BC or CF */
  orderNumberPrefix: string;
  // --- CRM -------------------------------------------------------------
  interactions: CustomerInteraction[];
  reviews: CustomerReview[];
  complaints: CustomerComplaint[];
  segments: CustomerSegment[];
  campaigns: MarketingCampaign[];
  /** One row per brand: the earn/redeem/tier model is data, not code. */
  loyaltyRules: LoyaltyRules[];
  loyaltyLedger: LoyaltyEntry[];
  memberships: Membership[];
};
