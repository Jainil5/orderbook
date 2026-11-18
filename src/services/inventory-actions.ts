"use server";

import {
  recordDemoInventoryMovement,
  saveDemoInventoryItem,
  saveDemoProductIngredients,
} from "@/lib/demo/server";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import type {
  InventoryAdjustmentInput,
  InventoryItemUpsertInput,
  ProductIngredientInput,
} from "@/types/database";

/**
 * Thin session-checked wrappers, matching `product-actions`: the demo writes
 * are the implementation today, and the guard is what keeps a signed-out
 * browser from reaching them.
 */

export async function saveInventoryItemAction(
  itemId: string | null,
  input: InventoryItemUpsertInput,
) {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, error: "Not signed in." };
  return saveDemoInventoryItem(itemId, input);
}

export async function recordInventoryMovementAction(
  input: InventoryAdjustmentInput,
) {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, error: "Not signed in." };
  return recordDemoInventoryMovement(input);
}

export async function saveProductIngredientsAction(
  productId: string,
  rows: ProductIngredientInput[],
) {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, error: "Not signed in." };
  return saveDemoProductIngredients(productId, rows);
}
