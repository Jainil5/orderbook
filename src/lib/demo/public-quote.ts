import { DEMO_BRAND_CODES } from "@/lib/workspace/constants";
import { getDemoBrandPack } from "@/lib/demo/brands";
import { listDemoOrders } from "@/lib/demo/data";
import type { Order } from "@/types/database";

export async function findDemoOrderByPublicToken(
  token: string,
): Promise<{ order: Order; brandName: string } | null> {
  for (const code of DEMO_BRAND_CODES) {
    const orders = await listDemoOrders(undefined, code);
    const order = orders.find((o) => o.public_token === token);
    if (order) {
      return { order, brandName: getDemoBrandPack(code).brand.name };
    }
  }
  return null;
}
