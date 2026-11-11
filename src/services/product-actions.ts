"use server";

import {
  saveDemoProduct,
  setDemoProductActive,
  setDemoProductUnavailable,
} from "@/lib/demo/server";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import type { ProductUpsertInput } from "@/types/database";

export async function saveProductAction(
  productId: string | null,
  input: ProductUpsertInput,
) {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, error: "Not signed in." };
  return saveDemoProduct(productId, input);
}

export async function toggleProductActiveAction(
  productId: string,
  isActive: boolean,
) {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, error: "Not signed in." };
  return setDemoProductActive(productId, isActive);
}

export async function toggleProductUnavailableAction(
  productId: string,
  unavailable: boolean,
) {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, error: "Not signed in." };
  return setDemoProductUnavailable(productId, unavailable);
}
