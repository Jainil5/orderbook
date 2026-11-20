/**
 * The shelf's answer for a brand's menu, ready for a screen.
 *
 * `availability.ts` is deliberately pure — no pack read, no cookies — so the
 * maths can be tested without a server. This is its thin impure sibling
 * (mirroring `src/lib/hours/resolve.ts`): it loads the same rows the Inventory
 * tab shows and hands back the map, so Billing, the quotation builder and the
 * catalog all ask one question and get one answer instead of each reading
 * `product.stock_qty` their own way.
 */
import {
  listDemoIngredientsMerged,
  listDemoInventoryLedger,
  listDemoInventoryMerged,
  toDemoBrandCode,
} from "@/lib/demo/data";
import type { Product } from "@/types/database";
import {
  availabilityForProducts,
  type ProductAvailability,
} from "./availability";
import { inventoryPositions } from "./stock";

/**
 * Sellable-units-per-product for one brand's menu, from its live shelf.
 * Products with no recipe fall back to their own `stock_qty` inside
 * `availabilityForProducts`, so a brand that ships no recipes at all (the
 * furniture studio) is unaffected.
 */
export async function resolveAvailabilityForProducts(
  brandCode: string,
  products: readonly Product[],
): Promise<Map<string, ProductAvailability>> {
  const code = toDemoBrandCode(brandCode);
  const [items, ingredients, ledger] = await Promise.all([
    listDemoInventoryMerged(code),
    listDemoIngredientsMerged(code),
    listDemoInventoryLedger(code),
  ]);
  return availabilityForProducts(
    products,
    ingredients,
    inventoryPositions(items, ledger),
  );
}
