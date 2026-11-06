"use server";

import { revalidatePath } from "next/cache";
import { submitOrder } from "@/services/data";
import type { CreateOrderInput } from "@/types/database";

function revalidateOrderViews() {
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  revalidatePath("/analytics");
  revalidatePath("/customers");
  revalidatePath("/billing");
}

export async function submitOrderAction(input: CreateOrderInput) {
  const result = await submitOrder(input);
  if (result.ok) {
    revalidateOrderViews();
  }
  return result;
}
