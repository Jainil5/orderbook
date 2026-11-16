import { Suspense } from "react";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import {
  createdAtRangeQuery,
  orderInCalendarRange,
  resolveRange,
} from "@/lib/analytics/date-range";
import { snapshotFromOrderRecords } from "@/lib/analytics/snapshot";
import { computeRollups } from "@/lib/business/overview";
import { loadBusinessData } from "@/lib/business/registry";
import {
  appointmentsForDay,
  buildRecentActivity,
  staffAvailability,
  stockAlerts,
} from "@/lib/dashboard/feed";
import { buildDashboardNotifications } from "@/lib/dashboard/notifications";
import {
  getDemoOrderItems,
  listDemoAuditLog,
  listDemoOrders,
  listDemoProductsMerged,
  toDemoBrandCode,
} from "@/lib/demo/data";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { isOpenQuote, isOpenReceivable } from "@/lib/orders/order-rules";
import {
  listOrderItemsForOrders,
  listOrders,
  listProducts,
} from "@/services/data";
import { listOpenQuotesAndReceivables } from "@/services/order-operations";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { redirect } from "next/navigation";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const range = resolveRange(await searchParams);
  const now = new Date();
  const currencyCode = ws.settings.currency_code;
  const quotationEnabled = ws.settings.quotation_builder_enabled === true;

  // Open quotes and receivables are an action queue, not a period report,
  // so they stay all-time regardless of the selected range.
  if (ws.mode === "demo") {
    const code = toDemoBrandCode(ws.brand.code);
    const allOrders = await listDemoOrders(undefined, code);
    const orders = allOrders.filter((o) =>
      orderInCalendarRange(o.created_at, range.from, range.to),
    );
    // Manager collections are demo-only today; a failure here must not take
    // the operational summary down with it.
    const [itemGroups, products, ops, business, staff, audit] = await Promise.all([
      Promise.all(orders.map((o) => getDemoOrderItems(o.id, code))),
      listDemoProductsMerged({}, code),
      loadDemoOperations(code).catch(() => null),
      loadBusinessData(code).catch(() => null),
      listDemoStaff(code).catch(() => []),
      listDemoAuditLog(code).catch(() => []),
    ]);
    const tasks = ops?.tasks ?? [];
    const appointments = ops?.appointments ?? [];
    const shifts = ops?.shifts ?? [];
    const expenses = business?.expenses ?? [];
    const purchaseOrders = business?.purchaseOrders ?? [];
    const leave = business?.leave ?? [];

    const rollups = computeRollups(
      {
        orders: allOrders,
        products,
        tasks,
        appointments,
        shifts,
        expenses,
        purchaseOrders,
        leave,
      },
      now,
    );
    const openOrders = allOrders
      .filter((o) => isOpenQuote(o) || isOpenReceivable(o))
      .slice(0, 20);

    return (
      <Suspense fallback={null}>
        <DashboardHome
          snapshot={snapshotFromOrderRecords({
            orders,
            items: itemGroups.flat(),
            products,
            currencyCode,
          })}
          range={range}
          rollups={rollups}
          openOrders={openOrders}
          orderNumberColumn={ws.profile.ordersNumberColumn}
          quotationEnabled={quotationEnabled}
          notifications={buildDashboardNotifications({
            rollups,
            orders: allOrders,
            products,
            tasks,
            leave,
            purchaseOrders,
            currencyCode,
            now,
          })}
          appointments={appointmentsForDay(appointments, staff, now)}
          staffSummary={staffAvailability(staff, rollups.onShiftNow)}
          stockAlerts={stockAlerts(products)}
          lowStockCount={rollups.lowStockCount}
          activity={buildRecentActivity({
            orders: allOrders.slice(0, 6),
            audit,
            currencyCode,
          })}
        />
      </Suspense>
    );
  }

  const { dateFrom, dateTo } = createdAtRangeQuery(range.from, range.to);
  // Two order reads: the range feeds the charts, the newest page feeds the
  // "today" counters and the activity list, which are all-time by definition.
  const [ordersRes, recentRes] = await Promise.all([
    listOrders({ page: 1, pageSize: 500, dateFrom, dateTo }),
    listOrders({ page: 1, pageSize: 500 }),
  ]);
  const [openRes, itemsRes, productsRes] = await Promise.all([
    listOpenQuotesAndReceivables(),
    listOrderItemsForOrders(ordersRes.data.map((order) => order.id)),
    listProducts({ activeOnly: false }),
  ]);

  const products = productsRes.data;
  const rollups = computeRollups(
    {
      orders: recentRes.data,
      products,
      // The Manager collections have no Supabase reader yet, so the rollups
      // stay at zero and the cards say so instead of inventing numbers.
      tasks: [],
      appointments: [],
      shifts: [],
      expenses: [],
      purchaseOrders: [],
      leave: [],
    },
    now,
  );

  return (
    <Suspense fallback={null}>
      <DashboardHome
        snapshot={snapshotFromOrderRecords({
          orders: ordersRes.data,
          items: itemsRes.data,
          products,
          currencyCode,
        })}
        range={range}
        notice={ordersRes.error ?? openRes.error}
        rollups={rollups}
        openOrders={openRes.data}
        orderNumberColumn={ws.profile.ordersNumberColumn}
        quotationEnabled={quotationEnabled}
        notifications={buildDashboardNotifications({
          rollups,
          orders: recentRes.data,
          products,
          tasks: [],
          leave: [],
          purchaseOrders: [],
          currencyCode,
          now,
        })}
        stockAlerts={stockAlerts(products)}
        lowStockCount={rollups.lowStockCount}
        activity={buildRecentActivity({
          orders: recentRes.data.slice(0, 8),
          currencyCode,
        })}
        opsDataAvailable={false}
      />
    </Suspense>
  );
}
