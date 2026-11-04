"use server";

import { submitOrder } from "@/services/data";
import type { CreateOrderInput } from "@/types/database";

export async function submitOrderAction(input: CreateOrderInput) {
  return submitOrder(input);
}
