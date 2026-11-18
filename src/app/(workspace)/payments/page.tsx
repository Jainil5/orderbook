import { redirect } from "next/navigation";

// Payments is now a Manager sub-module; keep old bookmarks and deep links alive.
export default function PaymentsPage() {
  redirect("/manager/payments");
}
