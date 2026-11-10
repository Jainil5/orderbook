export function paymentBadgeTone(
  status: string,
): "success" | "warning" | "demo" | "neutral" {
  if (status === "paid") return "success";
  if (status === "pending") return "warning";
  if (status === "partial") return "demo";
  return "neutral";
}
