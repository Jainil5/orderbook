import { snapshotFromOrderRecords } from "@/lib/analytics/snapshot";
import type { Slice, TrendPoint } from "@/lib/analytics/snapshot";
import { revenueOrders } from "@/lib/orders/order-rules";
import { getDemoBrandPack } from "@/lib/demo/brands";
import type { DemoBrandCode } from "@/lib/workspace/constants";

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
