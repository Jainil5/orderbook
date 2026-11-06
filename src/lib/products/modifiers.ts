import type { Product } from "@/types/database";

export type ProductModifier = {
  id: string;
  name: string;
  price: number;
};

export function parseProductModifiers(
  product: Product,
): ProductModifier[] {
  const raw = product.modifiers_json;
  if (!raw || !Array.isArray(raw)) return [];
  const out: ProductModifier[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = String(r.id ?? "").trim();
    const name = String(r.name ?? "").trim();
    const price = Number(r.price);
    if (!id || !name || !Number.isFinite(price) || price < 0) continue;
    out.push({ id, name, price });
  }
  return out;
}

export function serializeProductModifiers(
  modifiers: ProductModifier[],
): ProductModifier[] {
  return modifiers
    .map((m) => ({
      id: m.id.trim().slice(0, 40),
      name: m.name.trim().slice(0, 80),
      price: Math.round(m.price * 100) / 100,
    }))
    .filter((m) => m.id && m.name);
}
