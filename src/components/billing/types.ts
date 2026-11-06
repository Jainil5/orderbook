import type { Product } from "@/types/database";

export type CartLine = {
  product: Product;
  quantity: number;
  modifierIds: string[];
};
