import { snapshotFromOrderRecords } from "@/lib/analytics/snapshot";
import type { Slice, TrendPoint } from "@/lib/analytics/snapshot";
import { revenueOrders } from "@/lib/orders/order-rules";
import { getDemoBrandPack } from "@/lib/demo/brands";
import {
  DEMO_BRAND_CODES,
  type DemoBrandCode,
} from "@/lib/workspace/constants";

const TREND_DAYS = 30;
const SLICES = 5;

export type DemoShowcaseStats = {
  brandName: string;
  currency: string;
  trend: TrendPoint[];
  categories: Slice[];
  tenders: Slice[];
  periodRevenue: number;
  periodBills: number;
};

export function getDemoShowcaseStats(
  code: DemoBrandCode,
): DemoShowcaseStats {
  const pack = getDemoBrandPack(code);
  const snapshot = snapshotFromOrderRecords({
    orders: revenueOrders(pack.orders),
    items: pack.orderItems,
    products: pack.products,
    payments: pack.payments,
    currencyCode: pack.settings.currency_code,
  });
  const trend = snapshot.salesOverTime.slice(-TREND_DAYS);
  return {
    brandName: pack.brand.name,
    currency: snapshot.currencyCode,
    trend,
    categories: snapshot.salesByCategory.slice(0, SLICES),
    tenders: snapshot.paymentMethods.slice(0, SLICES),
    periodRevenue: trend.reduce((total, point) => total + point.revenue, 0),
    periodBills: trend.reduce((total, point) => total + point.orders, 0),
  };
}

/** How much seeded data sits behind a demo brand, for the entry-page cards. */
export type DemoBrandSummary = {
  code: DemoBrandCode;
  brandName: string;
  currency: string;
  bills: number;
  products: number;
  customers: number;
  staff: number;
  historyMonths: number;
};

function summarize(code: DemoBrandCode): DemoBrandSummary {
  const pack = getDemoBrandPack(code);
  const stamps = pack.orders.map((order) => Date.parse(order.created_at));
  const latest = Math.max(...stamps);
  const earliest = Math.min(...stamps);
  const days = Number.isFinite(latest) && Number.isFinite(earliest) ? (latest - earliest) / 86_400_000 : 0;
  return {
    code,
    brandName: pack.brand.name,
    currency: pack.settings.currency_code,
    bills: pack.orders.length,
    products: pack.products.length,
    customers: pack.customers.length,
    staff: pack.staff.length,
    historyMonths: Math.max(1, Math.round(days / 30.44)),
  };
}

export function getBrandSummaries(): DemoBrandSummary[] {
  return DEMO_BRAND_CODES.map(summarize);
}
