import { redirect } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/workspace/page-shell";
import {
  ManagerSectionHeader,
  ManagerStatRow,
  ManagerSubnav,
} from "@/components/manager/manager-ui";
import { ProductMixChart } from "@/components/manager/products/intelligence-charts";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  listDemoOrderItemsForOrders,
  listDemoOrders,
  listDemoProductsMerged,
  toDemoBrandCode,
} from "@/lib/demo/data";
import { computeMarginSnapshot } from "@/lib/analytics/margin";
import { deadStockCandidates, soldProductIds } from "@/lib/products/inventory";
import { inventoryValuation, productStock } from "@/lib/business/overview";
import { formatMoney } from "@/lib/format";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import type { Order, OrderItem, Product } from "@/types/database";

/**
 * Per-product profitability.
 *
 * Exclusions mirror `computeMarginSnapshot` exactly — cancelled and refunded
 * orders do not count, and a credit note (child order) is not a second sale —
 * so the rows below add up to the headline figures above them.
 */
type ProductRow = {
  id: string;
  name: string;
  category: string;
  isActive: boolean;
  units: number;
  revenue: number;
  cost: number;
  margin: number;
  marginPercent: number;
};

function productPerformance(
  products: Product[],
  orders: Order[],
  orderItems: OrderItem[],
): ProductRow[] {
  const saleOrderIds = new Set(
    orders
      .filter(
        (o) => o.status !== "cancelled" && o.status !== "refunded" && !o.parent_order_id,
      )
      .map((o) => o.id),
  );
  const byId = new Map<string, ProductRow>();
  const costById = new Map(products.map((p) => [p.id, p.cost_price ?? 0]));
  for (const product of products) {
    byId.set(product.id, {
      id: product.id,
      name: product.name,
      category: product.category ?? "No category",
      isActive: product.is_active,
      units: 0,
      revenue: 0,
      cost: 0,
      margin: 0,
      marginPercent: 0,
    });
  }

  for (const item of orderItems) {
    if (!item.product_id || !saleOrderIds.has(item.order_id)) continue;
    const row = byId.get(item.product_id);
    if (!row) continue;
    row.units += item.quantity;
    row.revenue += item.line_total;
    row.cost += (costById.get(item.product_id) ?? 0) * item.quantity;
  }

  return [...byId.values()].map((row) => {
    const margin = row.revenue - row.cost;
    return {
      ...row,
      margin,
      marginPercent: row.revenue > 0 ? (margin / row.revenue) * 100 : 0,
    };
  });
}

function quadrant(units: number, marginPercent: number, unitBar: number, marginBar: number) {
  if (units >= unitBar && marginPercent >= marginBar) return "Stars";
  if (units >= unitBar) return "Volume drivers";
  if (marginPercent >= marginBar) return "Niche earners";
  return "Watch";
}

export default async function ProductIntelligencePage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("intelligence")) redirect("/manager/products");

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Product intelligence">
        <ManagerSubnav manager="products" activeHref="/manager/products/intelligence" />
        <EmptyState
          title="Product analytics are not connected to live workspaces yet"
          description="Margin and stock analysis reads the demo order history. Live workspaces can use the Analytics screen until the platform tables land."
        />
      </PageShell>
    );
  }

  const code = toDemoBrandCode(ws.brand.code);
  const [products, orders, orderItems] = await Promise.all([
    listDemoProductsMerged({ activeOnly: false }, code),
    listDemoOrders(undefined, code),
    listDemoOrderItemsForOrders(code),
  ]);

  const money = (value: number) => formatMoney(value, ws.settings.currency_code);
  const margin = computeMarginSnapshot({ orders, orderItems, products });
  const rows = productPerformance(products, orders, orderItems);
  const sold = rows.filter((r) => r.units > 0);
  const byMargin = [...sold].sort((a, b) => b.margin - a.margin);
  const bestSellers = [...sold].sort((a, b) => b.units - a.units).slice(0, 8);
  const slowMovers = rows
    .filter((r) => r.isActive)
    .sort((a, b) => a.units - b.units || a.name.localeCompare(b.name))
    .slice(0, 8);
  const deadStock = deadStockCandidates(products, soldProductIds(orders, orderItems));
  const valuation = inventoryValuation(products);

  const unitBar = sold.length
    ? sold.reduce((total, r) => total + r.units, 0) / sold.length
    : 0;
  const marginBar = margin.marginPercent;
  const mix = [...byMargin].slice(0, 7).map((row) => ({
    name: row.name,
    value: Math.round(row.revenue),
  }));
  const restRevenue = byMargin.slice(7).reduce((total, r) => total + r.revenue, 0);
  if (restRevenue > 0) mix.push({ name: "All other lines", value: Math.round(restRevenue) });

  return (
    <PageShell title="Product intelligence">
      <ManagerSubnav manager="products" activeHref="/manager/products/intelligence" />
      <ManagerSectionHeader
        title="Product intelligence"
        description="Profitability and margin, best sellers and slow movers, dead-stock candidates. Read-only: nothing here changes a record."
      />

      <ManagerStatRow
        stats={[
          {
            label: "Billed revenue",
            value: money(margin.revenue),
            hint: `${sold.length} of ${rows.length} lines have sold`,
          },
          {
            label: "Cost of goods",
            value: money(margin.cost),
            hint: "Each line's catalogue cost × quantity sold",
          },
          {
            label: "Gross margin",
            value: money(margin.margin),
            hint: `${margin.marginPercent.toFixed(0)}% blended`,
          },
          {
            label: "Stock value at cost",
            value: money(valuation.costValue),
            hint: `${valuation.units} units on hand`,
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <h2 className="font-semibold">Profitability by product</h2>
          <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
            Computed over the whole order history on file, margin contribution
            first. Lines that have never sold are left out here and listed under
            slow movers instead.
          </p>
          {byMargin.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--ob-text-muted)]">
              No billed sales to analyse yet.
            </p>
          ) : (
            <div className="ob-scroll-x mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">
                  Units, revenue, cost and margin per product
                </caption>
                <thead className="text-xs uppercase text-[var(--ob-text-muted)]">
                  <tr>
                    <th className="py-1 pr-3">Product</th>
                    <th className="py-1 pr-3 text-right">Units</th>
                    <th className="py-1 pr-3 text-right">Revenue</th>
                    <th className="py-1 pr-3 text-right">Cost</th>
                    <th className="py-1 pr-3 text-right">Margin</th>
                    <th className="py-1 text-right">Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {byMargin.slice(0, 15).map((row) => (
                    <tr key={row.id} className="border-t border-[var(--ob-border)]">
                      <td className="py-1.5 pr-3">
                        {row.name}
                        <span className="block text-xs text-[var(--ob-text-muted)]">
                          {row.category}
                          {!row.isActive ? " · inactive" : ""}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 text-right">{row.units}</td>
                      <td className="py-1.5 pr-3 text-right">{money(row.revenue)}</td>
                      <td className="py-1.5 pr-3 text-right">{money(row.cost)}</td>
                      <td className="py-1.5 pr-3 text-right">{money(row.margin)}</td>
                      <td className="py-1.5 text-right">
                        {row.marginPercent.toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {byMargin.length > 15 ? (
            <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
              Showing the top 15 of {byMargin.length} sold lines.
            </p>
          ) : null}
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold">Where the revenue comes from</h2>
          <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
            Billed revenue share of the best {mix.length} lines.
          </p>
          {mix.length > 0 ? (
            <ProductMixChart
              slices={mix}
              centerLabel="Revenue"
              centerValue={money(margin.revenue)}
            />
          ) : (
            <p className="mt-3 text-sm text-[var(--ob-text-muted)]">
              Nothing to chart yet.
            </p>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold">Best sellers</h2>
          {bestSellers.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--ob-text-muted)]">No sales yet.</p>
          ) : (
            <ol className="mt-2 space-y-1.5 text-sm">
              {bestSellers.map((row, index) => (
                <li key={row.id} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate">
                    <span className="text-[var(--ob-text-muted)]">{index + 1}. </span>
                    {row.name}
                  </span>
                  <span className="shrink-0">
                    {row.units} units · {money(row.margin)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold">Slow movers</h2>
          <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
            Active catalogue lines with the fewest units sold.
          </p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {slowMovers.map((row) => (
              <li key={row.id} className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate">{row.name}</span>
                <span className="shrink-0 text-[var(--ob-text-muted)]">
                  {row.units === 0
                    ? "never sold"
                    : `${row.units} units · ${money(row.revenue)}`}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold">Dead stock</h2>
          <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
            Active lines holding stock that no order on file sold. Money sitting
            on the shelf.
          </p>
          {deadStock.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--ob-text-muted)]">
              Every stocked line appears in at least one order.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {deadStock.map((product) => (
                <li key={product.id} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate">{product.name}</span>
                  <span className="shrink-0 text-[var(--ob-text-muted)]">
                    {productStock(product)} units ·{" "}
                    {money(productStock(product) * (product.cost_price ?? 0))} at cost
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-[var(--ob-text-muted)]">
            <Link
              href="/manager/products/inventory"
              className="text-[var(--ob-primary)] underline"
            >
              Set reorder levels in Inventory
            </Link>{" "}
            or buy the line back down in Procurement.
          </p>
        </Card>
      </div>

      <Card className="mt-4 p-4">
        <h2 className="font-semibold">Margin against volume</h2>
        <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
          A line is a high-volume seller at or above the average units sold (
          {unitBar.toFixed(1)}) and a high-margin line at or above the blended{" "}
          {marginBar.toFixed(0)}%.
        </p>
        <div className="ob-scroll-x mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <caption className="sr-only">
              Volume, margin percentage and quadrant per sold product
            </caption>
            <thead className="text-xs uppercase text-[var(--ob-text-muted)]">
              <tr>
                <th className="py-1 pr-3">Product</th>
                <th className="py-1 pr-3 text-right">Units</th>
                <th className="py-1 pr-3 text-right">Margin %</th>
                <th className="py-1 pr-3 text-right">Margin</th>
                <th className="py-1">Quadrant</th>
              </tr>
            </thead>
            <tbody>
              {[...sold]
                .sort((a, b) => b.units * b.marginPercent - a.units * a.marginPercent)
                .slice(0, 12)
                .map((row) => (
                  <tr key={row.id} className="border-t border-[var(--ob-border)]">
                    <td className="py-1.5 pr-3">{row.name}</td>
                    <td className="py-1.5 pr-3 text-right">{row.units}</td>
                    <td className="py-1.5 pr-3 text-right">
                      {row.marginPercent.toFixed(0)}%
                    </td>
                    <td className="py-1.5 pr-3 text-right">{money(row.margin)}</td>
                    <td className="py-1.5">
                      {quadrant(row.units, row.marginPercent, unitBar, marginBar)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-4 p-4">
        <h2 className="text-sm font-semibold">
          What this page cannot tell you yet
        </h2>
        <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
          Cost comes from each catalogue line&apos;s own cost price, so a cafe
          drink is costed as one whole unit rather than the espresso, milk and
          cup that went into it. Ingredient and recipe costing is a planned
          extension: once a recipe links a sale line to its component products,
          the margin columns on this page will read through it and nothing else
          here changes.
        </p>
      </Card>
    </PageShell>
  );
}
