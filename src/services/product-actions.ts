"use server";

import { revalidatePath } from "next/cache";
import {
  createProduct,
  setProductActive,
  updateProduct,
} from "@/services/data";
import { saveDemoProduct, setDemoProductActive } from "@/lib/demo/server";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import type { ProductUpsertInput } from "@/types/database";

export async function saveProductAction(
  productId: string | null,
  input: ProductUpsertInput,
) {
  const ws = await loadWorkspaceSession();
  if (ws?.mode === "demo") return saveDemoProduct(productId, input);

  const result = productId
    ? await updateProduct(productId, input)
    : await createProduct(input);

  if (result.ok) {
    revalidatePath("/products");
    revalidatePath("/billing");
  }

  return result;
}

export async function toggleProductActiveAction(
  productId: string,
  isActive: boolean,
) {
  const ws = await loadWorkspaceSession();
  if (ws?.mode === "demo") return setDemoProductActive(productId, isActive);

  const result = await setProductActive(productId, isActive);
  if (result.ok) {
    revalidatePath("/products");
    revalidatePath("/billing");
  }
  return result;
}
